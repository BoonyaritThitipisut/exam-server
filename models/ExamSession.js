module.exports = (sequelize, DataTypes) => {
    const ExamSession = sequelize.define('ExamSession', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: DataTypes.INTEGER,
        exam_id: DataTypes.INTEGER,
        start_time: DataTypes.DATE,
        finished_at: DataTypes.DATE,
        expires_at: DataTypes.DATE,
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        current_question_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        answered_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        score: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        tableName: 'exam_sessions',
        timestamps: false
    });

    return ExamSession;
};
