import { NextResponse } from 'next/server';

const fileStore = globalThis.elsFileStore || (globalThis.elsFileStore = new Map());

function safeFilename(name) {
    if (!name || typeof name !== 'string') return null;
    const base = name.replace(/[^\w\u3131-\u318E\uAC00-\uD7A3._\-\s]/g, '').trim().slice(0, 120);
    return base.endsWith('.xlsx') ? base : base ? `${base}.xlsx` : null;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');
        if (!token) {
            return new NextResponse('token required', { status: 400 });
        }
        const buffer = fileStore.get(token);
        if (!buffer) {
            return new NextResponse('파일이 없거나 만료되었습니다.', { status: 404 });
        }
        fileStore.delete(token);
        const requested = safeFilename(searchParams.get('filename'));
        const name = requested || `els_hyper_${Date.now()}.xlsx`;
        const asciiFallback = name.replace(/[^\x00-\x7F]/g, '_') || 'els_result.xlsx';
        const disp = /[^\x00-\x7F]/.test(name)
            ? `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
            : `attachment; filename="${name}"`;
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': disp,
            },
        });
    } catch (e) {
        return new NextResponse(String(e.message), { status: 500 });
    }
}
