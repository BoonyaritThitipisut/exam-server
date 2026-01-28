const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authMiddleware = require('../middlewares/auth.middleware');
const teacherMiddleware = require('../middlewares/teacher.middleware');

// Protect all routes
router.use(authMiddleware);
router.use(teacherMiddleware);

// ===========================================
// GET /api/teacher/exams
// ดูรายการข้อสอบที่ตัวเองสร้าง (หรือทั้งหมดถ้าต้องการ)
// ===========================================
router.get('/exams', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM exams ORDER BY id DESC');
        res.json({ ok: true, exams: result.rows });
    } catch (err) {
        console.error('TEACHER GET EXAMS ERROR:', err);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

// ===========================================
// GET /api/teacher/reports/scores
// ดูคะแนนสอบของนักเรียน
// ===========================================
router.get('/reports/scores', async (req, res) => {
    try {
        // Reuse logic from admin report or customize for teacher
        // Here we just fetch all finished sessions similar to admin
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

        // ... exact same score calculation logic as admin ...
        // For brevity, we can extract score calculation to a service function later.
        // For now, let's just return raw sessions to prove endpoint works.
        // Or better yet, we can ask user if they want full logic duplicated or refactored.

        // Let's implement full logic to be safe and complete.
        const sessions = sessionsResult.rows;
        const report = [];

        for (const session of sessions) {
            const answersResult = await db.query(
                "SELECT question_id, choice_id FROM answers WHERE exam_session_id = $1",
                [session.session_id]
            );
            const userAnswers = answersResult.rows;

            const questionsResult = await db.query(
                "SELECT questions FROM exams WHERE id = $1",
                [session.exam_id]
            );

            const questions = questionsResult.rows[0]?.questions || [];
            let score = 0;
            const total = questions.length;

            for (const q of questions) {
                const correctIds = (q.choices || [])
                    .filter(c => c.is_correct)
                    .map(c => c.id);

                const selectedIds = userAnswers
                    .filter(a => a.question_id === q.id)
                    .map(a => a.choice_id);

                let isCorrect = false;
                if (q.question_type === 'mcq') {
                    if (selectedIds.length === 1 && correctIds.includes(selectedIds[0])) isCorrect = true;
                } else if (q.question_type === 'multi_mcq') {
                    if (correctIds.every(id => selectedIds.includes(id)) && selectedIds.every(id => correctIds.includes(id))) isCorrect = true;
                }
                if (isCorrect) score++;
            }

            report.push({ ...session, score, total_questions: total });
        }

        res.json({ ok: true, report });

    } catch (err) {
        console.error('TEACHER REPORT ERROR:', err);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

module.exports = router;
