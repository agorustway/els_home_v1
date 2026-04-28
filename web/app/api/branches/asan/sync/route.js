import { NextResponse } from 'next/server';


export async function POST() {
    try {
        // [v5.10.x] WebDAV 대신 나스 Docker 백엔드(app.py)의 동기화 API를 직접 호출
        // 백엔드의 Python 파서가 메모리 효율적이며 UPSERT를 지원함
        const backendUrl = `${process.env.NEXT_PUBLIC_ELS_BACKEND_URL}/api/branches/asan/sync`;
        
        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`NAS 백엔드 에러: ${response.status}`);
        }
        
        const data = await response.json();
        return NextResponse.json({ results: data.results || [] });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
