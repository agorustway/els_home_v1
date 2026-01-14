const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const match = line.match(/^([^#=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length - 1);
                }
                process.env[key] = value;
            }
        });
    }
}

async function debug() {
    loadEnv();
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    console.log('User:', emailUser);
    console.log('Pass:', emailPass ? '********' : 'MISSING');

    if (!emailUser || !emailPass) {
        console.error('Missing credentials in .env.local');
        return;
    }

    const isNaver = emailUser.includes('@naver.com');

    const transporter = nodemailer.createTransport({
        host: isNaver ? 'smtp.naver.com' : 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: emailUser,
            pass: emailPass,
        },
        timeout: 10000 // 10 seconds
    });

    const mailOptions = {
        from: emailUser,
        to: 'elshoon@naver.com, elsmj@naver.com',
        subject: '[DEBUG] Test Email',
        html: '<p>This is a test email sent from debug script.</p>',
    };

    try {
        console.log('Attempting to send mail...');
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        console.log('Response:', info.response);
    } catch (error) {
        console.error('Detailed Error:');
        console.error(error);
    }
}

debug();
