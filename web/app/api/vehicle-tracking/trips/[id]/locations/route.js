import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/vehicle-tracking/trips/[id]/locations
 * 특정 운행의 전체 위치 경로 조회 (맵 그리기용)
 */
export async function GET(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;

    try {
        const { data, error } = await supabase
            .from('vehicle_locations')
            .select('*')
            .eq('trip_id', id)
            .order('recorded_at', { ascending: true });

        if (error) throw error;
        return NextResponse.json({ locations: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
