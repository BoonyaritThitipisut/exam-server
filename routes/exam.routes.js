const express = require("express");
const router = express.Router();
const db = require("../config/db");
const authMiddleware = require("../middlewares/auth.middleware");

/*
|--------------------------------------------------------------------------
| POST /api/exam/start
| เริ่มสอบ
|--------------------------------------------------------------------------
*/
router.post("/start", authMiddleware, async (req, res) => {
    try {
        const { exam_id } = req.body;
        const user_id = req.user_id;

        // Check for ANY existing session for this exam
        const existingSession = await db.query(
            `
            SELECT id, active, finished_at, expires_at 
            FROM exam_sessions 
            WHERE user_id = $1 
              AND exam_id = $2
            LIMIT 1
            `,
            [user_id, exam_id]
        );

        if (existingSession.rowCount > 0) {
            const session = existingSession.rows[0];
            const now = new Date();
            const expiresAt = new Date(session.expires_at);

            // If finished, block
            if (session.finished_at) {
                return res.status(403).json({
                    ok: false,
                    error: "You have already submitted this exam."
                });
            }

            // If not finished, check if expired
            if (expiresAt < now) {
                return res.status(403).json({
                    ok: false,
                    error: "Exam time has expired. You cannot restart."
                });
            }

            // If active and valid time, Resume
            if (session.active) {
                return res.json({
                    ok: true,
                    exam_session_id: session.id,
                    message: "Resuming existing session"
                });
            }

            // If logic falls here (e.g. inactive but time remaining?), treat as expired or already taken depending on policy.
            // With Unique constraint, we can't create new anyway.
            return res.status(403).json({
                ok: false,
                error: "You have already taken this exam."
            });
        }

        const examResult = await db.query(
            `SELECT duration_minutes FROM exams WHERE id = $1`,
            [exam_id]
        );

        if (examResult.rowCount === 0) {
            return res.status(404).json({ ok: false, error: "Exam not found" });
        }

        const duration = examResult.rows[0].duration_minutes;

        const sessionResult = await db.query(
            `
            INSERT INTO exam_sessions
              (user_id, exam_id, start_time, expires_at, active)
            VALUES
              ($1, $2, NOW(), NOW() + ($3 || ' minutes')::interval, true)
            RETURNING id
            `,
            [user_id, exam_id, duration]
        );

        res.json({
            ok: true,
            exam_session_id: sessionResult.rows[0].id
        });

    } catch (err) {
        console.error("START EXAM ERROR:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/exam/status
| เช็คสถานะการสอบ (เวลาเหลือ, จบหรือยัง)
|--------------------------------------------------------------------------
*/
router.get("/status", authMiddleware, async (req, res) => {
    try {
        const user_id = req.user_id;

        // Find the latest session for this user
        const sessionResult = await db.query(
            `
            SELECT 
                id, 
                expires_at, 
                finished_at, 
                active 
            FROM exam_sessions
            WHERE user_id = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [user_id]
        );

        if (sessionResult.rowCount === 0) {
            return res.json({
                ok: true,
                status: "no_session",
                is_finished: false
            });
        }

        const session = sessionResult.rows[0];
        const now = new Date();
        const expiresAt = new Date(session.expires_at);

        let remainingSeconds = 0;
        let isExpired = false;
        let isFinished = !!session.finished_at; // If finished_at is set, it's finished

        if (!isFinished) {
            const diff = expiresAt - now;
            if (diff > 0) {
                remainingSeconds = Math.floor(diff / 1000);
            } else {
                isExpired = true;
                remainingSeconds = 0;
            }
        }

        res.json({
            ok: true,
            exam_session_id: session.id,
            remaining_seconds: remainingSeconds,
            is_expired: isExpired,
            is_finished: isFinished,
            active: session.active
        });

    } catch (err) {
        console.error("GET STATUS ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

/*
|--------------------------------------------------------------------------
| GET /api/exam/question
| ดึงคำถามทีละข้อ
|--------------------------------------------------------------------------
*/
/*
|--------------------------------------------------------------------------
| GET /api/exam/questions (All) for ESP32
| ดึงคำถาม "ทั้งหมด" พร้อม choice (สุ่มลำดับแล้ว)
|--------------------------------------------------------------------------
*/
router.get("/questions", authMiddleware, async (req, res) => {
    try {
        const user_id = req.user_id;

        const sessionResult = await db.query(
            `
            SELECT id, exam_id
            FROM exam_sessions
            WHERE user_id = $1
              AND active = true
              AND expires_at > NOW()
            ORDER BY id DESC
            LIMIT 1
            `,
            [user_id]
        );

        if (sessionResult.rowCount === 0) {
            return res.status(403).json({ ok: false, error: "No active session" });
        }

        const { exam_id } = sessionResult.rows[0];

        // 1. Fetch Exam and Questions
        const examResult = await db.query(
            "SELECT questions FROM exams WHERE id = $1",
            [exam_id]
        );

        if (examResult.rowCount === 0) {
            return res.status(404).json({ ok: false, error: "Exam not found" });
        }

        let questions = examResult.rows[0].questions || [];

        // Randomize Order
        questions = questions.sort(() => 0.5 - Math.random());

        const questionsWithChoices = questions.map(q => ({
            id: q.id,
            type: q.question_type,
            text: q.question_text,
            choices: q.choices ? q.choices.map(c => ({
                id: c.id,
                choice_text: c.choice_text
            })) : []
        }));

        res.json({
            ok: true,
            total: questionsWithChoices.length,
            questions: questionsWithChoices
        });

    } catch (err) {
        console.error("GET QUESTIONS ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/exam/answer
| บันทึกคำตอบ (mcq + multi_mcq)
|--------------------------------------------------------------------------
*/
router.post("/answer", authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
        const { question_id, choice_ids } = req.body;
        const user_id = req.user_id;

        if (!question_id || !Array.isArray(choice_ids)) {
            return res.status(400).json({
                ok: false,
                error: "question_id and choice_ids[] required"
            });
        }

        const sessionResult = await client.query(
            `
            SELECT id
            FROM exam_sessions
            WHERE user_id = $1
              AND active = true
              AND expires_at > NOW()
            ORDER BY id DESC
            LIMIT 1
            `,
            [user_id]
        );

        if (sessionResult.rowCount === 0) {
            return res.status(403).json({
                ok: false,
                error: "No active exam session"
            });
        }

        const exam_session_id = sessionResult.rows[0].id;

        await client.query("BEGIN");

        await client.query(
            `
            DELETE FROM answers
            WHERE exam_session_id = $1
              AND question_id = $2
            `,
            [exam_session_id, question_id]
        );

        for (const choice_id of choice_ids) {
            await client.query(
                `
                INSERT INTO answers (exam_session_id, question_id, choice_id)
                VALUES ($1, $2, $3)
                `,
                [exam_session_id, question_id, choice_id]
            );
        }

        await client.query("COMMIT");
        res.json({ ok: true });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("SAVE ANSWER ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    } finally {
        client.release();
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/exam/submit
| ตรวจคำตอบ + คิดคะแนน
|--------------------------------------------------------------------------
*/
router.post("/submit", authMiddleware, async (req, res) => {
    try {
        const user_id = req.user_id;

        const sessionResult = await db.query(
            `
            SELECT id, exam_id
            FROM exam_sessions
            WHERE user_id = $1
              AND active = true
              AND expires_at > NOW()
            ORDER BY id DESC
            LIMIT 1
            `,
            [user_id]
        );

        if (sessionResult.rowCount === 0) {
            return res.status(403).json({
                ok: false,
                error: "No active exam session"
            });
        }

        const { id: exam_session_id, exam_id } = sessionResult.rows[0];

        const questionsResult = await db.query(
            "SELECT questions FROM exams WHERE id = $1",
            [exam_id]
        );

        const questionsList = questionsResult.rows[0]?.questions || [];

        let score = 0;
        const total = questionsList.length;

        for (const q of questionsList) {
            const question_id = q.id;

            const userAnswers = await db.query(
                `
                SELECT choice_id
                FROM answers
                WHERE exam_session_id = $1
                  AND question_id = $2
                `,
                [exam_session_id, question_id]
            );

            const selected = userAnswers.rows.map(r => r.choice_id);

            const correct = (q.choices || [])
                .filter(c => c.is_correct)
                .map(c => c.id);

            let isCorrect = false;

            if (q.question_type === "mcq") {
                isCorrect =
                    selected.length === 1 &&
                    correct.includes(selected[0]);
            }

            if (q.question_type === "multi_mcq") {
                isCorrect =
                    correct.every(id => selected.includes(id)) &&
                    selected.every(id => correct.includes(id));
            }

            if (isCorrect) score++;
        }

        await db.query(
            `
            UPDATE exam_sessions
            SET active = false,
                finished_at = NOW()
            WHERE id = $1
            `,
            [exam_session_id]
        );

        res.json({ ok: true, score, total });

    } catch (err) {
        console.error("SUBMIT ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/exam/upload
| อัปโหลดรูปคำตอบ (Handwriting)
|--------------------------------------------------------------------------
*/
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({ storage: storage });

router.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
    try {
        const user_id = req.user_id; // from JWT
        const { question_id } = req.body;
        const file = req.file;

        if (!file || !question_id) {
            return res.status(400).json({ ok: false, error: "File and question_id required" });
        }

        // Validate Session
        const sessionResult = await db.query(
            `
            SELECT id
            FROM exam_sessions
            WHERE user_id = $1 AND active = true AND expires_at > NOW()
            ORDER BY id DESC LIMIT 1
            `,
            [user_id]
        );

        if (sessionResult.rowCount === 0) {
            return res.status(403).json({ ok: false, error: "No active session" });
        }

        const exam_session_id = sessionResult.rows[0].id;
        const fileUrl = `/uploads/${file.filename}`;

        // Save to DB
        // 1. Delete old answer for this question log
        await db.query(
            "DELETE FROM answers WHERE exam_session_id = $1 AND question_id = $2",
            [exam_session_id, question_id]
        );

        // 2. Insert new answer (with file_url)
        await db.query(
            `
            INSERT INTO answers (exam_session_id, question_id, answer_file_url)
            VALUES ($1, $2, $3)
            `,
            [exam_session_id, question_id, fileUrl]
        );

        res.json({ ok: true, url: fileUrl });

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

module.exports = router;
