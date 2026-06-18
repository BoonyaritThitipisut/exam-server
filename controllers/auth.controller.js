const authService = require("../services/auth.service");

async function login(req, res) {
    try {
        const { student_id, password, device_id: bodyDeviceId } = req.body;
        const { device_id: queryDeviceId } = req.query;
        const device_id = bodyDeviceId || queryDeviceId;

        const result = await authService.login(
            student_id,
            password,
            device_id
        );

        res.json({
            ok: true,
            ...result,
        });
    } catch (err) {
        if (err.message === "INVALID_CREDENTIALS") {
            return res.status(401).json({
                ok: false,
                error: "INVALID_CREDENTIALS",
                message: "รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง",
            });
        }

        if (err.message === "ALREADY_LOGGED_IN") {
            return res.status(409).json({
                ok: false,
                error: "ALREADY_LOGGED_IN",
                message: "ผู้ใช้กำลังเข้าสู่ระบบอยู่แล้วในอุปกรณ์อื่น",
            });
        }

        res.status(500).json({
            ok: false,
            error: err.message || "SERVER_ERROR",
            message: "เกิดข้อผิดพลาดภายในระบบ",
        });
    }
}

module.exports = {
    login,
};
