
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendEmail({ to, bcc, subject, text, html }) {
    return transporter.sendMail({
        from: `"The Daily Chronicle" <${process.env.EMAIL_USER}>`,
        to,
        bcc,
        subject,
        text,
        html
    });
}

module.exports = {
    transporter,
    sendEmail
};
