function adminMiddleware(req, res, next) {
    if (req.user_role !== "admin") {
        return res.status(403).json({
            ok: false,
            error: "Access denied. Admins only."
        });
    }
    next();
}

module.exports = adminMiddleware;
