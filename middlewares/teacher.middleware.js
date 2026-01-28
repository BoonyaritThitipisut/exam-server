function teacherMiddleware(req, res, next) {
    if (req.user_role !== "admin" && req.user_role !== "teacher") {
        return res.status(403).json({
            ok: false,
            error: "Access denied. Teachers or Admins only."
        });
    }
    next();
}

module.exports = teacherMiddleware;
