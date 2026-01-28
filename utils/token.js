const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "CHANGE_THIS_TO_SUPER_SECRET";

function generateToken(payload) {
    return jwt.sign(payload, SECRET_KEY, { expiresIn: "2h" });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        return null;
    }
}

module.exports = {
    generateToken,
    verifyToken,
};
