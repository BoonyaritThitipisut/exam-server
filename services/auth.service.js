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

    // 2) ตรวจสอบว่ามี session ที่ active อยู่หรือไม่
    const existingSession = await db.query(
        "SELECT id, device_id FROM exam_sessions WHERE user_id = $1 AND active = true",
        [userId]
    );

    if (existingSession.rowCount > 0) {
        // ถ้ามี session ค้างอยู่ และ device_id ไม่ตรงกัน (หรือไม่มี device_id ส่งมา) ให้แจ้งเตือน
        // แต่ถ้า device_id ตรงกัน (เช่นเน็ตหลุดเข้าใหม่เครื่องเดิม) ให้อนุญาต (Resume Login)
        const currentSession = existingSession.rows[0];
        if (device_id && currentSession.device_id === device_id) {
            // อนุญาตให้ login ต่อได้ โดยปิดอันเก่าแล้วสร้างใหม่ หรือ return อันเก่า
            // เพื่อความง่าย ปิดอันเก่าแล้วให้สร้างใหม่ข้างล่าง
            await db.query("UPDATE exam_sessions SET active = false WHERE id = $1", [currentSession.id]);
        } else {
            throw new Error("ALREADY_LOGGED_IN");
        }
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
