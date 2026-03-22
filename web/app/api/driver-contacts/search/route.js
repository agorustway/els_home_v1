import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

/**
 * GET /api/driver-contacts/search?phone=01012345678&vehicle_number=1234
 * - 운전원 정보(driver_contacts)에서 매칭되는 프로필 검색
 */
export async function GET(request) {
    const supabase = await createAdminClient();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const vehicleNumber = searchParams.get('vehicle_number');

    if (!phone && !vehicleNumber) {
        return NextResponse.json({ error: 'phone or vehicle_number is required' }, { status: 400 });
    }

    try {
        let query = supabase.from('driver_contacts').select('*');
        
        if (phone) {
            // 하이픈 제거 후 검색
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            query = query.or(`phone.eq.${cleanPhone},phone.eq.${phone}`);
        }
        
        if (vehicleNumber) {
            query = query.eq('vehicle_number', vehicleNumber);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(1).single();

        if (error) {
            if (error.code === 'PGRST116') { // No result
                return NextResponse.json({ item: null });
            }
            throw error;
        }

        return NextResponse.json({ item: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
