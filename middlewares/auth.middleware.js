const { verifyToken } = require("../utils/token");

async function authMiddleware(req, res, next) {
    console.log("AUTH MIDDLEWARE (JWT)");

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({
            ok: false,
            error: "No authorization token"
        });
    }

    const token = auth.replace("Bearer ", "").trim();
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            ok: false,
            error: "Invalid or expired token"
        });
    }

    // ✅ ผูก user_id เข้ากับ request
    req.user_id = decoded.id;
    req.user_role = decoded.role;
    req.token = token;
    next();
}

module.exports = authMiddleware;
