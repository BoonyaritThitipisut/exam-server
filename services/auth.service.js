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

    // 2) ตรวจสอบว่ามี session ที่ active อยู่หรือไม่ (ไม่นับ session ที่หมดเวลาแล้ว)
    const activeSessions = await db.query(
        "SELECT id, device_id FROM exam_sessions WHERE user_id = $1 AND active = true AND expires_at > NOW()",
        [userId]
    );

    if (activeSessions.rowCount > 0) {
        if (device_id) {
            const sameDeviceSession = activeSessions.rows.find(
                session => session.device_id === device_id
            );

            if (sameDeviceSession) {
                // อนุญาตให้ device เก่ากลับมา login ต่อได้ โดยไม่ปิด session เดิม
                const token = generateToken({ id: userId, role });
                const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 ชม.

                return {
                    token,
                    expires_at: expiresAt,
                };
            }
        }

        // ถ้าเช็คแล้วไม่มี session เดิมที่ตรงกับ device_id ให้บล็อก
        throw new Error("ALREADY_LOGGED_IN");
    }

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
