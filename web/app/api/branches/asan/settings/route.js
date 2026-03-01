import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
    const { data, error } = await supabase
        .from('branch_dispatch_settings')
        .select('*')
        .eq('branch_id', 'asan')
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}

export async function PATCH(request) {
    const body = await request.json();
    const { data, error } = await supabase
        .from('branch_dispatch_settings')
        .upsert({
            branch_id: 'asan',
            glovis_path: body.glovis_path || '',
            mobis_path: body.mobis_path || '',
            updated_at: new Date().toISOString()
        }, { onConflict: 'branch_id' })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
}
