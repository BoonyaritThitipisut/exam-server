const AdminJS = require('adminjs')
const { buildRouter } = require('@adminjs/express')
const { Database, Resource } = require('@adminjs/sequelize')
// Load models so AdminJS can see them
// Load models so AdminJS can see them
const { sequelize, User, Exam } = require('../models')

// register sequelize adapter
AdminJS.registerAdapter({ Database, Resource })

const admin = new AdminJS({
    rootPath: '/admin',
    databases: [sequelize],
    resources: [
        {
            resource: User,
            options: {
                navigation: { name: 'User Management' },
                properties: {
                    role: {
                        position: 1,
                        availableValues: [
                            { value: 'student', label: 'Student' },
                            { value: 'admin', label: 'Admin' },
                            { value: 'teacher', label: 'Teacher' }
                        ]
                    },
                    student_id: { position: 2, isTitle: true },
                    password: {
                        position: 3,
                        type: 'password',
                        isVisible: { list: false, filter: false, show: false, edit: true }
                    }
                }
            }
        },
        {
            resource: Exam,
            options: {
                navigation: { name: 'Exam Management' },
                properties: {
                    name: {
                        position: 1,
                        isTitle: true
                    },
                    // Questions at the bottom after all basic info
                    questions: {
                        position: 6,
                        type: 'mixed',
                        isArray: true,
                    },
                    'questions.question_text': { type: 'textarea' },
                    'questions.question_type': {
                        availableValues: [
                            { value: 'mcq', label: 'Multiple Choice (MCQ)' },
                            { value: 'multi_mcq', label: 'Multiple Select' },
                            { value: 'handwriting', label: 'Handwriting / File Upload' }
                        ]
                    },
                    'questions.choices': {
                        type: 'mixed',
                        isArray: true
                    },
                    'questions.choices.choice_text': { type: 'string' },
                    'questions.choices.is_correct': { type: 'boolean' },
                    'questions.id': { isVisible: false },
                    'questions.choices.id': { isVisible: false },
                    description: {
                        position: 2,
                        type: 'textarea'
                    },
                    duration_minutes: {
                        position: 3
                    },
                    start_at: {
                        position: 4,
                        type: 'datetime'
                    },
                    end_at: {
                        position: 5,
                        type: 'datetime'
                    }
                }
            }
        }
    ]
})

const adminRouter = buildRouter(admin)

module.exports = {
    admin,
    adminRouter,
}
