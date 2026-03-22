const sequelize = require("../admin/sequelize");
const User = require("./User");
const Exam = require("./Exam");

const ExamSession = require("./ExamSession")(sequelize, require("sequelize").DataTypes);

// Associations
Exam.hasMany(ExamSession, { foreignKey: 'exam_id' });
ExamSession.belongsTo(Exam, { foreignKey: 'exam_id' });

User.hasMany(ExamSession, { foreignKey: 'user_id' });
ExamSession.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
    sequelize,
    User,
    Exam,
    ExamSession
};
