require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'exam_db',
    port: process.env.DB_PORT || 5432,
});

async function run() {
    try {
        await client.connect();
        console.log("Adding 'score' column to exam_sessions table...");

        await client.query(`
            ALTER TABLE exam_sessions 
            ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
        `);

        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

run();
