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
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const last8 = cleanPhone.slice(-8);
            if (last8.length >= 8) {
                // 뒷 8자리 매칭 시도 (ilike %12345678%)
                query = query.or(`phone.ilike.%${last8}%,phone.eq.${cleanPhone},phone.eq.${phone}`);
            } else {
                query = query.or(`phone.eq.${cleanPhone},phone.eq.${phone}`);
            }
        }
        
        if (vehicleNumber) {
            // business_number 또는 vehicle_number 둘 다 검색 시도 (테이블에 따라 다를 수 있음)
            query = query.or(`business_number.eq.${vehicleNumber},vehicle_number.eq.${vehicleNumber}`);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

        if (error) throw error;
        if (!data) return NextResponse.json({ item: null });

        // 데이터 필드 보정 (V3.6.1 호환용)
        const item = {
            ...data,
            business_number: data.business_number || data.vehicle_number || '',
            driver_id: data.driver_id || data.vehicle_id || ''
        };

        return NextResponse.json({ item });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
