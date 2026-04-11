import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: roleData } = await supabase.from('user_roles').select('can_write, role').eq('id', user.id).single();
    if (roleData?.role !== 'admin' && !roleData?.can_write) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { tableName } = body;
        
        if (!tableName) return NextResponse.json({ error: 'Table name is required' }, { status: 400 });

        // Get all rows
        const { data: rows, error: fetchError } = await supabase.from(tableName).select('*').order('created_at', { ascending: false });
        
        if (fetchError) throw fetchError;

        const uniqueMap = new Map();
        const idsToDelete = [];

        for (const row of rows) {
            // Create a unique key based on table type
            let key = '';
            if (tableName === 'internal_contacts') key = row.name + '|' + row.department;
            else if (tableName === 'driver_contacts') key = row.name + '|' + row.business_number;
            else if (tableName === 'work_sites') key = row.address + '|' + row.contact;
            else key = row.company_name + '|' + row.phone; // external_contacts, partner_contacts

            if (uniqueMap.has(key)) {
                // If we already have the newest one (since we ordered by descending), this is a duplicate
                idsToDelete.push(row.id);
            } else {
                uniqueMap.set(key, true);
            }
        }

        if (idsToDelete.length > 0) {
            // Delete in chunks of 50 to avoid limits
            for (let i = 0; i < idsToDelete.length; i += 50) {
                const chunk = idsToDelete.slice(i, i + 50);
                await supabase.from(tableName).delete().in('id', chunk);
            }
        }

        return NextResponse.json({ success: true, deletedCount: idsToDelete.length });

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: 'Deduplicate failed', details: err.message }, { status: 500 });
    }
}
