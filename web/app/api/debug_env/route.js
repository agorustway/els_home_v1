import { NextResponse } from 'next/server';

import { getNasClient } from '@/lib/nas';

export async function GET() {
    let nasTest = 'Not tested';
    try {
        const client = getNasClient();
        const exists = await client.exists('/');
        nasTest = exists ? 'Connected' : 'Root not found';
    } catch (e) {
        nasTest = 'Error: ' + e.message;
    }

    return NextResponse.json({
        envKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('NAS')),
        nasTest,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NAS_URL: process.env.NAS_URL,
        hasNextPublicAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasNasUser: !!process.env.NAS_USER,
        hasNasPw: !!process.env.NAS_PW,
    });
}
