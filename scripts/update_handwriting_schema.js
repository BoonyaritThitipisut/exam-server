require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'exam_db',
    port: process.env.DB_PORT || 5432,
});

async function updateSchema() {
    const client = await pool.connect();
    try {
        console.log('Start updating schema...');

        await client.query('BEGIN');

        // 1. Add answer_file_url to answers table if not exists
        await client.query(`
      ALTER TABLE answers 
      ADD COLUMN IF NOT EXISTS answer_file_url TEXT;
    `);
        console.log('Added answer_file_url to answers');

        // 2. Add question_type check constraint update if needed (optional)
        // If you have a check constraint on question_type, you might need to drop/add it to allow 'handwriting'
        // For now assuming it is just a text column or enum without strict check, or user manages it.

        // Example: If using ENUM type for question_type
        // await client.query(`ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'handwriting';`);

        await client.query('COMMIT');
        console.log('Schema update successful');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating schema:', err);
    } finally {
        client.release();
        pool.end();
    }
}

updateSchema();
