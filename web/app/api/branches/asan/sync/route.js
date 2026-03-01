import { NextResponse } from 'next/server';
import { syncAsanDispatch } from '@/lib/asan-dispatch';

export async function POST() {
    try {
        const results = await syncAsanDispatch();
        return NextResponse.json({ results });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
