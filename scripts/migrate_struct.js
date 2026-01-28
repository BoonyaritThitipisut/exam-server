const { sequelize, Question, Choice } = require('../models');

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB.');

        // 1. Add column if not exists (Sequelize 'alter' might do it, but let's be safe and manual/hybrid)
        // We will try to sync Question model to add the column
        console.log('Syncing Question model...');
        await Question.sync({ alter: true });

        // 2. Fetch all questions and their choices
        const questions = await Question.findAll();

        console.log(`Found ${questions.length} questions.`);

        for (const q of questions) {
            // Find choices for this question using the OLD association (which still exists in DB/code for now)
            // But we must be careful: if we already dropped the table, this fails. We haven't dropped yet.
            const choices = await Choice.findAll({ where: { question_id: q.id } });

            if (choices.length > 0) {
                const choiceData = choices.map(c => ({
                    id: c.id, // Preserve ID for answer linking
                    choice_text: c.choice_text,
                    is_correct: c.is_correct
                }));

                q.choices = choiceData;
                await q.save();
                console.log(`Updated Question ${q.id} with ${choices.length} choices.`);
            }
        }

        console.log('Data migration complete.');

        // 3. Drop Foreign Key on answers table if exists
        // 'answers' table likely has 'choice_id'. We assume no FK constraint was strictly enforced by Sequelize unless explicit.
        // But usually there is one if 'references' was used.
        // Let's check if we can drop the choices table safely.

        try {
            await sequelize.query('ALTER TABLE answers DROP CONSTRAINT IF EXISTS "answers_choice_id_fkey"'); // Postgres naming convention guess
            // Also might be answers_choice_id_choices_fk or similar.
            // Let's just catch error if it fails.
        } catch (e) {
            console.log('Note: Could not drop constraint (might not exist):', e.message);
        }

        // 4. Drop Choice Table
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
