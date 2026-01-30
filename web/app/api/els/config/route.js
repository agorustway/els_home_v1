import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const ELSBOT_DIR = path.join(process.cwd(), '..', 'elsbot');
const CONFIG_PATH = path.join(ELSBOT_DIR, 'els_config.json');

export async function POST(req) {
    try {
        const body = await req.json();
        const userId = body?.userId != null ? String(body.userId).trim() : '';
        const userPw = body?.userPw != null ? String(body.userPw) : '';
        if (!userId || !userPw) {
            return NextResponse.json({ error: '아이디와 비밀번호가 필요합니다.' }, { status: 400 });
        }
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ user_id: userId, user_pw: userPw }, null, 2), 'utf8');
        return NextResponse.json({ success: true, defaultUserId: userId });
    } catch (e) {
        return NextResponse.json({ error: String(e.message) }, { status: 500 });
    }
}

export async function GET() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return NextResponse.json({ hasSaved: false, defaultUserId: '' });
        }
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const config = JSON.parse(raw);
        const userId = config.user_id || '';
        const hasSaved = Boolean(userId && (config.user_pw || '').length > 0);
        return NextResponse.json({
            hasSaved,
            defaultUserId: userId || '',
        });
    } catch (e) {
        return NextResponse.json({ hasSaved: false, defaultUserId: '' });
    }
}
