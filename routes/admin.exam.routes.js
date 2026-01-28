const express = require("express");
const router = express.Router();
const db = require("../config/db");

const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

// Protect all routes in this file
router.use(authMiddleware);
router.use(adminMiddleware);

// ================================
// GET /api/admin/exams
// ดึงรายชื่อ exam ทั้งหมด
// ================================
router.get("/", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM exams ORDER BY id DESC");
        res.json({
            ok: true,
            exams: result.rows
        });
    } catch (err) {
        console.error("GET EXAMS ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

// ================================
// GET /api/admin/exams/reports/scores
// รายงานคะแนนสอบ
// ================================
router.get("/reports/scores", async (req, res) => {
    try {
        // 1. Fetch all finished sessions
        const sessionsResult = await db.query(`
            SELECT 
                es.id AS session_id,
                es.user_id,
                u.student_id,
                es.exam_id,
                e.name AS exam_name,
                es.start_time,
                es.finished_at
            FROM exam_sessions es
            JOIN users u ON u.id = es.user_id
            JOIN exams e ON e.id = es.exam_id
            WHERE es.finished_at IS NOT NULL
            ORDER BY es.finished_at DESC
        `);

        const sessions = sessionsResult.rows;
        const report = [];

        // 2. Calculate score for each session
        for (const session of sessions) {
            // Get user answers
            const answersResult = await db.query(
                "SELECT question_id, choice_id FROM answers WHERE exam_session_id = $1",
                [session.session_id]
            );
            const userAnswers = answersResult.rows;

            // Get Correct answers for this exam
            const questionsResult = await db.query(
                "SELECT questions FROM exams WHERE id = $1",
                [session.exam_id]
            );

            const questions = questionsResult.rows[0]?.questions || [];
            let score = 0;
            const total = questions.length;

            for (const q of questions) {
                // Find correct choices
                const correctIds = (q.choices || [])
                    .filter(c => c.is_correct)
                    .map(c => c.id);

                // Find user selected choices for this question
                const selectedIds = userAnswers
                    .filter(a => a.question_id === q.id)
                    .map(a => a.choice_id);

                let isCorrect = false;
                if (q.question_type === 'mcq') {
                    if (selectedIds.length === 1 && correctIds.includes(selectedIds[0])) {
                        isCorrect = true;
                    }
                } else if (q.question_type === 'multi_mcq') {
                    if (correctIds.every(id => selectedIds.includes(id)) &&
                        selectedIds.every(id => correctIds.includes(id))) {
                        isCorrect = true;
                    }
                }

                if (isCorrect) score++;
            }

            report.push({
                ...session,
                score,
                total_questions: total
            });
        }

        res.json({ ok: true, report });

    } catch (err) {
        console.error("GET SCORE REPORT ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

// ================================
// GET /api/admin/exams/:id
// ดูรายละเอียด exam + คำถาม
// ================================
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get Exam Info
        const examResult = await db.query("SELECT * FROM exams WHERE id = $1", [id]);
        if (examResult.rowCount === 0) {
            return res.status(404).json({ ok: false, error: "Exam not found" });
        }
        const exam = examResult.rows[0];

        // 2. Get Questions from exam.questions JSONB
        const questions = exam.questions || [];

        res.json({
            ok: true,
            exam,
            questions
        });
    } catch (err) {
        console.error("GET EXAM DETAIL ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

// ================================
// POST /api/admin/exams
// สร้างข้อสอบใหม่
// ================================
router.post("/", async (req, res) => {
    try {
        const {
            name,
            description,
            duration_minutes,
            start_at,
            end_at
        } = req.body;

        if (!name || !duration_minutes) {
            return res.status(400).json({
                ok: false,
                error: "name and duration_minutes are required"
            });
        }

        const result = await db.query(
            `
      INSERT INTO exams
        (name, description, duration_minutes, start_at, end_at)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id
      `,
            [
                name,
                description || null,
                duration_minutes,
                start_at || null,
                end_at || null
            ]
        );

        res.json({
            ok: true,
            exam_id: result.rows[0].id
        });

    } catch (err) {
        console.error("CREATE EXAM ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

// ==================================================
// POST /api/admin/exams/:exam_id/questions
// เพิ่มคำถามเข้า exam (รองรับ 1 / หลายคำตอบ)
// ==================================================
router.post("/:exam_id/questions", async (req, res) => {
    const client = await db.connect();

    try {
        const exam_id = parseInt(req.params.exam_id, 10);

        const {
            question_text,
            question_type,            // "mcq" | "multi_mcq"
            choices,                  // ["A","B","C"]
            correct_choice_indexes    // [1] หรือ [0,2]
        } = req.body;

        // ---------- validate ----------
        if (
            !question_text ||
            !question_type ||
            !Array.isArray(choices) ||
            choices.length < 2 ||
            !Array.isArray(correct_choice_indexes) ||
            correct_choice_indexes.length === 0
        ) {
            return res.status(400).json({
                ok: false,
                error: "Invalid question data"
            });
        }

        if (question_type === "mcq" && correct_choice_indexes.length !== 1) {
            return res.status(400).json({
                ok: false,
                error: "MCQ must have exactly 1 correct answer"
            });
        }

        await client.query("BEGIN");

        // Fetch current exam
        const examResult = await client.query(
            "SELECT questions FROM exams WHERE id = $1",
            [exam_id]
        );

        if (examResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ ok: false, error: "Exam not found" });
        }

        const currentQuestions = examResult.rows[0].questions || [];

        // Create new question object
        const choiceData = choices.map((text, i) => ({
            id: Math.floor(Math.random() * 1000000000),
            choice_text: text,
            is_correct: correct_choice_indexes.includes(i)
        }));

        const newQuestion = {
            id: Math.floor(Math.random() * 1000000000),
            question_text,
            question_type,
            choices: choiceData
        };

        // Add to questions array
        currentQuestions.push(newQuestion);

        // Update exam
        await client.query(
            "UPDATE exams SET questions = $1 WHERE id = $2",
            [JSON.stringify(currentQuestions), exam_id]
        );

        await client.query("COMMIT");

        res.json({
            ok: true,
            question_id: newQuestion.id,
            question_order: currentQuestions.length - 1
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("ADD QUESTION ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    } finally {
        client.release();
    }
});

// ================================
// PUT /api/admin/exams/:id
// แก้ไขรายละเอียด exam
// ================================
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, duration_minutes, start_at, end_at } = req.body;

        const result = await db.query(
            `
            UPDATE exams
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                duration_minutes = COALESCE($3, duration_minutes),
                start_at = COALESCE($4, start_at),
                end_at = COALESCE($5, end_at)
            WHERE id = $6
            RETURNING *
            `,
            [name, description, duration_minutes, start_at, end_at, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ ok: false, error: "Exam not found" });
        }

        res.json({ ok: true, exam: result.rows[0] });

    } catch (err) {
        console.error("UPDATE EXAM ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

// ================================
// DELETE /api/admin/exams/:id
// ลบข้อสอบ
// ================================
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Check if there are active sessions? Ignore for now, just delete.
        // If cascading is not set up, we might need to delete related data manually.
        // Safe approach: wrap in transaction

        const client = await db.connect();
        try {
            await client.query("BEGIN");

            // 1. Delete related answers and sessions
            await client.query("DELETE FROM answers WHERE exam_session_id IN (SELECT id FROM exam_sessions WHERE exam_id = $1)", [id]);
            await client.query("DELETE FROM exam_sessions WHERE exam_id = $1", [id]);

            // 3. Delete exam
            const result = await client.query("DELETE FROM exams WHERE id = $1 RETURNING id", [id]);

            if (result.rowCount === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ ok: false, error: "Exam not found" });
            }

            await client.query("COMMIT");
            res.json({ ok: true, message: "Deleted successfully" });

        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("DELETE EXAM ERROR:", err);
        res.status(500).json({ ok: false, error: "Server error" });
    }
});

module.exports = router;
