import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createAdminClient();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
        return NextResponse.json({ error: '전화번호가 필요합니다.' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
        return NextResponse.json({ error: '유효하지 않은 전화번호' }, { status: 400 });
    }

    try {
        const last8 = cleanPhone.slice(-8);
        const p1 = last8.slice(0, 4);
        const p2 = last8.slice(4, 8);
        
        const { data, error } = await supabase
            .from('driver_contacts')
            .select('*')
            .ilike('phone', `%${p1}%${p2}%`)
            .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ driver: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { name, phone, vehicle_number, vehicle_id, photo_driver, photo_vehicle, photo_chassis } = body;

        if (!phone || !name) {
            return NextResponse.json({ error: '이름과 전화번호는 필수입니다.' }, { status: 400 });
        }

        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const last8 = cleanPhone.slice(-8);
        const p1 = last8.slice(0, 4);
        const p2 = last8.slice(4, 8);

        // 기존 존재 여부 확인
        const { data: existingData, error: checkError } = await supabase
            .from('driver_contacts')
            .select('*')
            .ilike('phone', `%${p1}%${p2}%`)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingData) {
            // 업데이트 (기존 계약유형 등은 유지, 입력받은 정보만 덮어쓰기)
            const { data, error } = await supabase
                .from('driver_contacts')
                .update({
                    name: name || existingData.name,
                    vehicle_number: vehicle_number || existingData.vehicle_number,
                    vehicle_id: vehicle_id || existingData.vehicle_id,
                    photo_driver: photo_driver || existingData.photo_driver,
                    photo_vehicle: photo_vehicle || existingData.photo_vehicle,
                    photo_chassis: photo_chassis || existingData.photo_chassis,
                })
                .eq('id', existingData.id)
                .select()
                .maybeSingle();

            if (error) throw error;
            return NextResponse.json({ driver: data, message: 'updated' });
        } else {
            // 신규 인서트 (미계약 차량으로 기본 저장)
            const { data, error } = await supabase
                .from('driver_contacts')
                .insert([{
                    name,
                    phone: cleanPhone,
                    vehicle_number,
                    vehicle_id,
                    photo_driver,
                    photo_vehicle,
                    photo_chassis,
                    contract_type: 'uncontracted'
                }])
                .select()
                .maybeSingle();

            if (error) throw error;
            return NextResponse.json({ driver: data, message: 'created' });
        }

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
