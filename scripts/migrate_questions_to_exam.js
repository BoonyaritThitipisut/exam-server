const { sequelize, Exam, Question, ExamQuestion } = require('../models');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        // 1. เพิ่มคอลัมน์ questions ลงในตาราง Exams (ถ้ายังไม่มี)
        // เพื่อเตรียมเก็บข้อมูลคำถามทั้งหมดรวมไว้ในไฟล์ข้อสอบเลย (JSONB)
        console.log('Syncing Exam model (adding questions column)...');
        await Exam.sync({ alter: true });

        // 2. ดึงข้อมูลการสอบ (Exam) ทั้งหมดออกมาจาก Database
        const exams = await Exam.findAll();
        console.log(`Found ${exams.length} exams.`);

        for (const exam of exams) {
            // 3. ดึงคำถามที่ผูกกับการสอบนี้ผ่านตารางกลาง (exam_questions)
            // ใช้ Raw Query เพื่อความชัวร์และหลีกเลี่ยงปัญหาเรื่อง Alias ของ Sequelize
            const [linkedQuestions] = await sequelize.query(
                `
                SELECT q.*, eq.question_order
                FROM questions q
                JOIN exam_questions eq ON q.id = eq.question_id
                WHERE eq.exam_id = :examId
                ORDER BY eq.question_order ASC
                `,
                {
                    replacements: { examId: exam.id }
                }
            );

            if (linkedQuestions.length > 0) {
                // 4. แปลงข้อมูลที่ได้ เพื่อเตรียมเก็บในรูปแบบ JSON
                const questionData = linkedQuestions.map(q => ({
                    id: q.id,
                    question_text: q.question_text,
                    question_type: q.question_type,
                    // ข้อมูล choices ใน DB เดิมอาจเป็น String หรือ JSON Object
                    // ต้องแปลงให้แน่ใจว่าเป็น Object ก่อนเก็บ
                    choices: typeof q.choices === 'string' ? JSON.parse(q.choices) : (q.choices || [])
                }));
                // 5. บันทึกข้อมูลคำถามทั้งหมดลงในคอลัมน์ questions ของ Exam
                exam.questions = questionData;
                await exam.save();
                console.log(`Migrated ${linkedQuestions.length} questions to Exam ${exam.id}`);
            } else {
                // ถ้าไม่มีคำถาม ให้กำหนดให้เป็น Array ว่างๆ

                exam.questions = [];
                await exam.save();
            }
        }

        console.log('Data migration complete.');

        // 6. ลบ Constraints (Foreign Key) ที่ผูกติดกับตาราง answers
        // เพราะเรากำลังจะลบตาราง questions ทิ้ง ถ้าไม่ปลดล็อคก่อนจะลบไม่ได้
        try {
            await sequelize.query('ALTER TABLE answers DROP CONSTRAINT IF EXISTS "answers_question_id_fkey"');
            // ตรวจสอบ constraint อื่นๆ ที่อาจเกี่ยวข้องด้วย
        } catch (e) {
            console.log('Note: FK drop error (might not exist):', e.message);
        }

        // 7. ลบตาราง ExamQuestion (ตารางเชื่อมโยง) ทิ้ง เพราะไม่ได้ใช้แล้ว
        console.log('Dropping ExamQuestion table...');
        await ExamQuestion.drop();
        // 8. ลบตาราง Question ทิ้ง เพราะย้ายข้อมูลไปอยู่ใน Exam หมดแล้ว
        console.log('Dropping Question table...');
        await Question.drop();

        console.log('Migration successful.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sequelize.close();
    }
}

migrate();
