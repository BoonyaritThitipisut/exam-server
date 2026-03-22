const { DataTypes } = require("sequelize");
const sequelize = require("../admin/sequelize");

const Exam = sequelize.define(
    "Exam",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
        },
        duration_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        start_at: {
            type: DataTypes.DATE,
        },
        end_at: {
            type: DataTypes.DATE,
        },
        questions: {
            type: DataTypes.JSONB,
            defaultValue: [],
        }
    },
    {
        tableName: "exams",
        timestamps: false,
        hooks: {
            beforeSave: (exam) => {
                // For updates where ID exists, we can ensure nice IDs
                if (exam.id && Array.isArray(exam.questions)) {
                    exam.questions = exam.questions.map((q, index) => {
                        // Pattern: ExamID * 1000 + (Index + 1)
                        // Example: Exam 5, Question 1 -> 5001
                        const cleanId = (exam.id * 1000) + (index + 1);

                        let choices = q.choices || [];
                        if (Array.isArray(choices)) {
                            choices = choices.map((c, cIndex) => ({
                                ...c,
                                // Choice ID: QuestionID * 10 + (Index + 1) -> 50011, 50012
                                id: (cleanId * 10) + (cIndex + 1)
                            }));
                        }

                        // Preserve other props, strictly overwrite ID
                        return { ...q, id: cleanId, choices };
                    });
                }
                // If Creating (no ID), we wait for afterCreate
            },
            afterCreate: async (exam, options) => {
                // ID is now generated. Update questions to match our nice pattern.
                if (Array.isArray(exam.questions) && exam.questions.length > 0) {
                    const updatedQuestions = exam.questions.map((q, index) => {
                        const cleanId = (exam.id * 1000) + (index + 1);

                        let choices = q.choices || [];
                        if (Array.isArray(choices)) {
                            choices = choices.map((c, cIndex) => ({
                                ...c,
                                id: (cleanId * 10) + (cIndex + 1)
                            }));
                        }

                        return { ...q, id: cleanId, choices };
                    });

                    // Update directly in DB or via save
                    // We must use update to avoid triggering infinite hooks if we called save()
                    // But exam is an instance.
                    exam.questions = updatedQuestions;
                    await exam.save({ hooks: false, transaction: options.transaction });
                }
            }
        }
    }
);

module.exports = Exam;
