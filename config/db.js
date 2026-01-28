const { Pool } = require("pg");

const pool = new Pool({
    host: "localhost",
    user: "postgres",
    password: "1234",
    database: "exam_db",
    port: 5432,
});

module.exports = pool;
