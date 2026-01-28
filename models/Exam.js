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
                // Ensure IDs for questions and choices
                if (Array.isArray(exam.questions)) {
                    exam.questions = exam.questions.map(q => {
                        const qId = q.id || Math.floor(Math.random() * 1000000000);

                        let choices = q.choices || [];
                        if (Array.isArray(choices)) {
                            choices = choices.map(c => ({
                                ...c,
                                id: c.id || Math.floor(Math.random() * 1000000000)
                            }));
                        }

                        return { ...q, id: qId, choices };
                    });
                }
            }
        }
    }
);

module.exports = Exam;
