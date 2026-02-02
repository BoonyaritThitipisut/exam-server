const { sequelize, Question, Choice } = require('../models');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        // 1. ซิงค์ตาราง Question เพื่อเพิ่มคอลัมน์ใหม่ (ถ้าจำเป็น)
        // หรือเตรียมพร้อมสำหรับการแก้ไขโครงสร้าง
        console.log('Syncing Question model...');
        await Question.sync({ alter: true });

        // 2. ดึงข้อมูลคำถาม (Question) ทั้งหมดออกมา
        const questions = await Question.findAll();

        console.log(`Found ${questions.length} questions.`);

        for (const q of questions) {
            // 3. ค้นหา "ตัวเลือก" (Choices) ของแต่ละคำถามจากตาราง Choice เดิม
            // (เป็นการย้ายจากตารางแยก มารวมในคำถามเดียว)
            const choices = await Choice.findAll({ where: { question_id: q.id } });

            if (choices.length > 0) {
                const choiceData = choices.map(c => ({
                    id: c.id, // เตรียมข้อมูลตัวเลือกให้อยู่ในรูปแบบ object
                    choice_text: c.choice_text,
                    is_correct: c.is_correct
                }));
                // 4. บันทึกข้อมูลตัวเลือกลงในคอลัมน์ choices ของตาราง Question
                q.choices = choiceData;
                await q.save();
                console.log(`Updated Question ${q.id} with ${choices.length} choices.`);
            }
        }

        console.log('Data migration complete.');

        // 5. ลบ Foreign Key ในตาราง answers ที่ชี้ไปยังตาราง Choice (ถ้ามี)
        // เพื่อป้องกัน Error เวลาลบตาราง Choice ทิ้ง

        try {
            await sequelize.query('ALTER TABLE answers DROP CONSTRAINT IF EXISTS "answers_choice_id_fkey"');
            // อาจจะมีชื่อ constraint อื่นๆ ก็ดัก error ไว้
        } catch (e) {
            console.log('Note: Could not drop constraint (might not exist):', e.message);
        }

        // 6. ลบตาราง Choice ทิ้ง (เพราะเราย้ายข้อมูลไปเก็บใน Question หมดแล้ว)
        console.log('Dropping Choice table...');
        await Choice.drop();

        console.log('Migration successful.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sequelize.close();
    }
}

migrate();
