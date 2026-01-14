import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request) {
    try {
        const { title, category, content, contact } = await request.json();

        // 1. SMTP 설정 (Gmail 또는 Naver)
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;

        if (!emailUser || emailUser.includes('your-email')) {
            throw new Error('.env.local 파일에 EMAIL_USER와 EMAIL_PASS를 먼저 설정해주세요.');
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
        });

        // 2. 메일 내용 구성
        const subjectPrefix = category === '고객 문의' ? '[고객 문의]' : '[부조리/인권침해 제보]';
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'elshoon@naver.com, elsmj@naver.com', // 콤마(,)로 구분하여 수신자를 추가할 수 있습니다.
            subject: `${subjectPrefix} ${category}${title ? `: ${title}` : ''}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #e53e3e; border-bottom: 2px solid #e53e3e; padding-bottom: 10px;">
                        ${category === '고객 문의' ? '새로운 고객 문의가 접수되었습니다.' : '부조리 및 인권침해 제보 접수'}
                    </h2>
                    <p><strong>구분:</strong> ${category}</p>
                    ${title ? `<p><strong>제목:</strong> ${title}</p>` : ''}
                    <div style="background-color: #f7fafc; padding: 15px; border-radius: 5px; margin-top: 10px;">
                        <strong>제보 내용:</strong><br/>
                        ${content.replace(/\n/g, '<br/>')}
                    </div>
                    <p style="margin-top: 20px;"><strong>연락처/성함:</strong> ${contact || '익명'}</p>
                    <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="font-size: 12px; color: #718096;">본 메일은 시스템에 의해 자동 발송되었습니다.</p>
                </div>
            `,
        };

        // 3. 메일 발송
        await transporter.sendMail(mailOptions);

        return NextResponse.json({ message: 'Success' }, { status: 200 });
    } catch (error) {
        console.error('Email sending error:', error);
        return NextResponse.json({ message: 'Error', error: error.message }, { status: 500 });
    }
}
