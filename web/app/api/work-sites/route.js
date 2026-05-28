import { NextResponse } from 'next/server';
import { getAuthenticatedAdminClient } from '@/lib/api-auth';
import { normalizeKoreanPhoneNumberInput } from '@/utils/koreanPhoneNumber.mjs';

export async function GET() {
    const { adminSupabase: supabase } = await getAuthenticatedAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: sites, error: sitesError } = await supabase
        .from('work_sites')
        .select('*')
        .order('created_at', { ascending: false });
    if (sitesError) return NextResponse.json({ error: sitesError.message }, { status: 500 });

    const ids = (sites || []).map((s) => s.id);
    let managers = [];
    if (ids.length > 0) {
        const { data: mData } = await supabase
            .from('work_site_managers')
            .select('*')
            .in('work_site_id', ids)
            .order('sort_order', { ascending: true });
        managers = mData || [];
    }
    const managersBySite = {};
    managers.forEach((m) => {
        if (!managersBySite[m.work_site_id]) managersBySite[m.work_site_id] = [];
        managersBySite[m.work_site_id].push(m);
    });

    const list = (sites || []).map((s) => ({
        ...s,
        managers: managersBySite[s.id] || [],
    }));
    return NextResponse.json({ list });
}

export async function POST(request) {
    const { user, adminSupabase: supabase } = await getAuthenticatedAdminClient();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const body = await request.json();
        const { site_name, address, contact, work_method, notes, attachments, managers } = body;
        const row = {
            site_name: site_name ?? '',
            address: address || '',
            contact: normalizeKoreanPhoneNumberInput(contact ?? ''),
            work_method: work_method ?? '',
            notes: notes ?? '',
            attachments: Array.isArray(attachments) ? attachments : [],
        };
        const { data: site, error: siteError } = await supabase.from('work_sites').insert([row]).select().single();
        if (siteError) throw siteError;

        const managerList = Array.isArray(managers) ? managers : [];
        if (managerList.length > 0) {
            const rows = managerList.map((m, i) => ({
                work_site_id: site.id,
                name: m.name || '',
                phone: normalizeKoreanPhoneNumberInput(m.phone ?? ''),
                role: m.role ?? '',
                sort_order: i,
            }));
            await supabase.from('work_site_managers').insert(rows);
        }

        const { data: managersData } = await supabase.from('work_site_managers').select('*').eq('work_site_id', site.id).order('sort_order');
        return NextResponse.json({ item: { ...site, managers: managersData || [] } });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
