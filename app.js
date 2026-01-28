const express = require('express')
const app = express()

const { admin, adminRouter } = require('./admin/admin');
app.use(admin.options.rootPath, adminRouter);

app.use(express.json())
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', require('./routes/auth.routes'))
const examRoutes = require("./routes/exam.routes");
app.use("/api/exam", examRoutes);

app.use("/api/admin/exams", require("./routes/admin.exam.routes"));
app.use("/api/teacher", require("./routes/teacher.routes"));

app.get("/", (req, res) => {
    res.send("Exam Server Running");
});

module.exports = app;





