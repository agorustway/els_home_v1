import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        const backendUrl = `${process.env.NEXT_PUBLIC_ELS_BACKEND_URL}/api/branches/asan/shipping`;
        
        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`NAS 백엔드 에러: ${response.status}`);
        }
        
        const data = await response.json();
        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
