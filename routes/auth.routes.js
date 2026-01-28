const express = require("express");
const router = express.Router();
const db = require("../config/db");
const controller = require("../controllers/auth.controller");

// ---------- health check ----------
router.get("/ping", async (req, res) => {
    try {
        const result = await db.query("SELECT NOW()");
        res.json({
            ok: true,
            db_time: result.rows[0].now,
        });
    } catch (err) {
        console.error("DB ERROR:", err.message);
        res.status(500).json({
            ok: false,
            error: err.message,
        });
    }
});

// ---------- auth ----------
router.post("/login", controller.login);

module.exports = router;

