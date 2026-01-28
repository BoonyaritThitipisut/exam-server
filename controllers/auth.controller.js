const authService = require("../services/auth.service");

async function login(req, res) {
    try {
        const { student_id, password, device_id } = req.body;

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
        res.status(401).json({
            ok: false,
            error: err.message,
        });
    }
}

module.exports = {
    login,
};
