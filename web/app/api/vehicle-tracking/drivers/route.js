import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
        return NextResponse.json({ error: '전화번호가 필요합니다.' }, { status: 400 });
    }

    // 전화번호에서 숫자만 추출 (DB에는 숫자만 저장되거나 하이픈이 섞여 있을 수 있음)
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (cleanPhone.length < 8) {
        return NextResponse.json({ error: '유효하지 않은 전화번호' }, { status: 400 });
    }

    try {
        // 전화번호 뒤 8자리로 검색 (ilike)
        const { data, error } = await supabase
            .from('driver_contacts')
            .select('*')
            .ilike('phone', `%${cleanPhone.slice(-8)}%`)
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ driver: null }); // 찾지 못함
            }
            throw error;
        }

        return NextResponse.json({ driver: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    const supabase = await createClient();

    try {
        const body = await request.json();
        const { name, phone, vehicle_number, vehicle_id } = body;

        if (!phone || !name) {
            return NextResponse.json({ error: '이름과 전화번호는 필수입니다.' }, { status: 400 });
        }

        // 전화번호 정제
        const cleanPhone = phone.replace(/[^0-9]/g, '');

        // 기존 존재 여부 확인
        const { data: existingData } = await supabase
            .from('driver_contacts')
            .select('*')
            .ilike('phone', `%${cleanPhone.slice(-8)}%`)
            .limit(1)
            .single();

        if (existingData) {
            // 업데이트 (기존 계약유형 등은 유지, 입력받은 정보만 덮어쓰기)
            const { data, error } = await supabase
                .from('driver_contacts')
                .update({
                    name: name || existingData.name,
                    vehicle_number: vehicle_number || existingData.vehicle_number,
                    vehicle_id: vehicle_id || existingData.vehicle_id,
                })
                .eq('id', existingData.id)
                .select()
                .single();

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
                    contract_type: 'uncontracted'
                }])
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json({ driver: data, message: 'created' });
        }

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
