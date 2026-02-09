import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: site, error: siteError } = await supabase.from('work_sites').select('*').eq('id', id).single();
    if (siteError) return NextResponse.json({ error: siteError.message }, { status: 500 });
    if (!site) return NextResponse.json({ item: null }, { status: 404 });

    const { data: managers } = await supabase
        .from('work_site_managers')
        .select('*')
        .eq('work_site_id', id)
        .order('sort_order', { ascending: true });

    return NextResponse.json({ item: { ...site, managers: managers || [] } });
}

export async function PATCH(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const body = await request.json();
        const updates = {};
        if (body.site_name !== undefined) updates.site_name = body.site_name;
        if (body.address !== undefined) updates.address = body.address;
        if (body.contact !== undefined) updates.contact = body.contact;
        if (body.work_method !== undefined) updates.work_method = body.work_method;
        if (body.notes !== undefined) updates.notes = body.notes;
        if (body.attachments !== undefined) updates.attachments = Array.isArray(body.attachments) ? body.attachments : [];

        if (Object.keys(updates).length > 0) {
            const { error: siteError } = await supabase.from('work_sites').update(updates).eq('id', id).select().single();
            if (siteError) throw siteError;
        }

        if (body.managers !== undefined) {
            await supabase.from('work_site_managers').delete().eq('work_site_id', id);
            const managerList = Array.isArray(body.managers) ? body.managers : [];
            if (managerList.length > 0) {
                const rows = managerList.map((m, i) => ({
                    work_site_id: id,
                    name: m.name || '',
                    phone: m.phone ?? '',
                    role: m.role ?? '',
                    sort_order: i,
                }));
                await supabase.from('work_site_managers').insert(rows);
            }
        }

        const { data: site } = await supabase.from('work_sites').select('*').eq('id', id).single();
        const { data: managers } = await supabase.from('work_site_managers').select('*').eq('work_site_id', id).order('sort_order');
        return NextResponse.json({ item: { ...site, managers: managers || [] } });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await supabase.from('work_site_managers').delete().eq('work_site_id', id);
    const { error } = await supabase.from('work_sites').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
