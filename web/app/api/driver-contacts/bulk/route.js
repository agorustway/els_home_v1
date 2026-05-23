import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { normalizeKoreanPhoneNumberInput } from '@/utils/koreanPhoneNumber.mjs';

export async function PATCH(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role verification (Admin only)
    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!roleData || roleData.role !== 'admin') {
        return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { ids, updates } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: '변경할 항목이 선택되지 않았습니다.' }, { status: 400 });
        }
        if (!updates || Object.keys(updates).length === 0) {
            return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 });
        }

        const normalizedUpdates = {
            ...updates,
            ...(updates.phone !== undefined ? { phone: normalizeKoreanPhoneNumberInput(updates.phone) } : {}),
        };

        const { data, error } = await supabase
            .from('driver_contacts')
            .update(normalizedUpdates)
            .in('id', ids)
            .select();

        if (error) throw error;

        return NextResponse.json({ success: true, count: data.length });
    } catch (err) {
        console.error('Bulk update error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
