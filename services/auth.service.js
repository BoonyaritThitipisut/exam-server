// services/auth.service.js
const db = require("../config/db");
const { generateToken } = require("../utils/token");

async function login(student_id, password, device_id) {
    // 1) ตรวจ user
    const userRes = await db.query(
        "SELECT id, role FROM users WHERE student_id = $1 AND password = $2",
        [student_id, password]
    );

    if (userRes.rowCount === 0) {
        throw new Error("INVALID_CREDENTIALS");
    }

    const { id: userId, role } = userRes.rows[0];

    // 2) ปิด session เก่า
    await db.query(
        "UPDATE exam_sessions SET active = false WHERE user_id = $1 AND active = true",
        [userId]
    );

    // 3) สร้าง token ใหม่ (JWT)
    const token = generateToken({ id: userId, role });
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 ชม.

    // 4) บันทึก session
    await db.query(
        `
    INSERT INTO exam_sessions
    (user_id, start_time, expires_at, active, device_id)
    VALUES ($1, NOW(), $2, true, $3)
    `,
        [userId, expiresAt, device_id]
    );

    return {
        token,
        expires_at: expiresAt,
    };
}

module.exports = {
    login,
};
