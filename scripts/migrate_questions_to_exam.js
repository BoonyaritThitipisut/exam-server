const { sequelize, Exam, Question, ExamQuestion } = require('../models');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        // 1. Add questions column to Exams
        console.log('Syncing Exam model (adding questions column)...');
        await Exam.sync({ alter: true });

        // 2. Fetch all exams
        const exams = await Exam.findAll();
        console.log(`Found ${exams.length} exams.`);

        for (const exam of exams) {
            // Fetch questions linked to this exam via junction table
            // We need raw query or working association. 
            // The association in models/index.js is: Exam.belongsToMany(Question, { through: ExamQuestion ... })
            // Let's use that.

            // Fetch questions linked to this exam via raw SQL to avoid Sequelize alias headaches
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
                const questionData = linkedQuestions.map(q => ({
                    id: q.id,
                    question_text: q.question_text,
                    question_type: q.question_type,
                    // choices is JSONB in DB, so it should be parsed automatically or already object
                    // In raw query, it might be string or object depending on driver handling.
                    // pg usually returns object for jsonb.
                    choices: typeof q.choices === 'string' ? JSON.parse(q.choices) : (q.choices || [])
                }));

                exam.questions = questionData;
                await exam.save();
                console.log(`Migrated ${linkedQuestions.length} questions to Exam ${exam.id}`);
            } else {
                // Initialize empty array if null
                exam.questions = [];
                await exam.save();
            }
        }

        console.log('Data migration complete.');

        // 3. Drop Constraints on answers table
        // answers usually references questions(id) and choices(id). 
        // We already dropped choices table, so that FK is gone.
        // We need to drop FK to questions.
        try {
            await sequelize.query('ALTER TABLE answers DROP CONSTRAINT IF EXISTS "answers_question_id_fkey"');
            // Also check for other constraints or indexes linked to questions table
        } catch (e) {
            console.log('Note: FK drop error (might not exist):', e.message);
        }

        // 4. Drop ExamQuestion (junction) and Question tables
        console.log('Dropping ExamQuestion table...');
        await ExamQuestion.drop();

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
