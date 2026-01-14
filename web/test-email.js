const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// .env.local 파일을 수동으로 읽어보기 (테스트용)
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('--- .env.local Content ---');
    console.log(envContent);
    console.log('--------------------------');
} else {
    console.log('.env.local file not found');
}

async function testConnection() {
    const user = process.env.EMAIL_USER || 'your-email@gmail.com';
    const pass = process.env.EMAIL_PASS || 'your-app-password';

    console.log(`Testing with User: ${user}`);

    // Gmail 설정
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: user,
            pass: pass
        }
    });

    try {
        await transporter.verify();
        console.log('SUCCESS: Connection verified (Gmail)');
    } catch (err) {
        console.log('FAILED (Gmail):', err.message);

        // Naver 설정 시도
        console.log('Trying Naver settings...');
        transporter = nodemailer.createTransport({
            host: 'smtp.naver.com',
            port: 465,
            secure: true,
            auth: {
                user: user,
                pass: pass
            }
        });

        try {
            await transporter.verify();
            console.log('SUCCESS: Connection verified (Naver)');
        } catch (err2) {
            console.log('FAILED (Naver):', err2.message);
        }
    }
}

testConnection();
