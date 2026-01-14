import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request) {
    try {
        const body = await request.json();
        const { title, category, content, contact } = body;

        console.log('Received report request:', { category, title, hasContent: !!content });

        // 1. SMTP 설정 (Gmail 또는 Naver)
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;

        if (!emailUser || !emailPass || emailUser.includes('your-email')) {
            console.error('Email credentials missing in .env.local');
            return NextResponse.json({
                message: 'Error',
                error: '이메일 설정(.env.local)이 누락되었습니다. EMAIL_USER와 EMAIL_PASS를 확인해주세요.'
            }, { status: 500 });
        }

        if (!content) {
            return NextResponse.json({
                message: 'Error',
                error: '제보 내용이 누락되었습니다.'
            }, { status: 400 });
        }

        const isNaver = emailUser.includes('@naver.com');

        // Gmail의 경우 service: 'gmail'을 사용하는 것이 더 안정적입니다.
        const transporterOptions = isNaver ? {
            host: 'smtp.naver.com',
            port: 465,
            secure: true,
            auth: {
                user: emailUser,
                pass: emailPass,
            },
        } : {
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass,
            },
        };

        const transporter = nodemailer.createTransport(transporterOptions);

        // 2. 메일 내용 구성
        const subjectPrefix = category === '고객 문의' ? '[고객 문의]' : '[부조리/인권침해 제보]';
        const mailOptions = {
            from: emailUser,
            to: 'elshoon@naver.com, elsmj@naver.com',
            subject: `${subjectPrefix} ${category}${title ? `: ${title}` : ''}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #e53e3e; border-bottom: 2px solid #e53e3e; padding-bottom: 10px; margin-top: 0;">
                        ${category === '고객 문의' ? '새로운 고객 문의가 접수되었습니다.' : '부조리 및 인권침해 제보 접수'}
                    </h2>
                    <div style="margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>구분:</strong> <span style="color: #2d3748;">${category}</span></p>
                        ${title ? `<p style="margin: 5px 0;"><strong>제목:</strong> <span style="color: #2d3748;">${title}</span></p>` : ''}
                    </div>
                    <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #e53e3e; margin: 20px 0; white-space: pre-wrap;">
                        <strong style="display: block; margin-bottom: 10px; color: #4a5568;">제보/문의 상세 내용:</strong>
                        ${content}
                    </div>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf2f7;">
                        <p style="margin: 5px 0;"><strong>연락처/성함:</strong> <span style="color: #2d3748;">${contact || '익명'}</span></p>
                    </div>
                    <p style="font-size: 12px; color: #a0aec0; margin-top: 40px; text-align: center;">본 메일은 시스템에 의해 자동 발송되었습니다.</p>
                </div>
            `,
        };

        // 3. 메일 발송
        console.log('Sending email to:', mailOptions.to);
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);

        return NextResponse.json({ message: 'Success' }, { status: 200 });
    } catch (error) {
        console.error('Email sending error details:', error);
        return NextResponse.json({
            message: 'Error',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
