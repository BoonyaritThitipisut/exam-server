const { DataTypes } = require("sequelize");
const sequelize = require("../admin/sequelize");

const User = sequelize.define(
    "User",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        student_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        role: {
            type: DataTypes.STRING,
            defaultValue: "student",
        },
    },
    {
        tableName: "users",
        timestamps: false,
    }
);

module.exports = User;
