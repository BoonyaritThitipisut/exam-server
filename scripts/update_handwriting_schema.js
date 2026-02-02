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
        // เริ่มต้น Transaction (ทำงานเป็นชุด ถ้าพลาดจะย้อนกลับหมด)
        await client.query('BEGIN');

        // 1. เพิ่มคอลัมน์ 'answer_file_url' ในตาราง answers ถ้ายังไม่มี
        // เพื่อใช้เก็บ URL ของไฟล์รูปที่นักเรียนวาดส่งมา (สำหรับข้อสอบ Handwriting)
        await client.query(`
      ALTER TABLE answers 
      ADD COLUMN IF NOT EXISTS answer_file_url TEXT;
    `);
        console.log('Added answer_file_url to answers');

        // 2. ส่วนนี้เผื่อไว้สำหรับการอัปเดตประเภทคำถาม (Question Type)
        // ถ้ามีการใช้ ENUM หรือ Check Constraint ก็จะต้องมาแก้ตรงนี้เพื่อให้รองรับประเภทใหม่
        // แต่ตอนนี้คอมเมนต์ไว้ก่อนเพราะยังไม่ได้ใช้ ENUM



        // บันทึกการเปลี่ยนแปลง (Commit)
        await client.query('COMMIT');
        console.log('Schema update successful');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating schema:', err);
    } finally {
        // ปิดการเชื่อมต่อ
        client.release();
        pool.end();
    }
}

updateSchema();
