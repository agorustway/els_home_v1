import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import { makeEducationLogValue } from '@/utils/vehicleEducation.mjs';

export async function POST(request) {
  const supabase = await createAdminClient();
  try {
    const body = await request.json();
    const { trip_id, notice_id, title, driver_name, vehicle_number, completed_by } = body;
    if (!notice_id) return NextResponse.json({ error: 'notice_id는 필수입니다.' }, { status: 400 });

    let resolvedTripId = trip_id || null;
    if (!resolvedTripId && vehicle_number) {
      const normalizedVehicle = String(vehicle_number).replace(/\s/g, '');
      const shortVehicle = normalizedVehicle.slice(-4);
      const { data: latestTrip, error: latestTripError } = await supabase
        .from('vehicle_trips')
        .select('id')
        .or(`vehicle_number.eq.${vehicle_number},vehicle_number.ilike.%${normalizedVehicle}%,vehicle_number.ilike.%${shortVehicle}%`)
        .in('status', ['driving', 'paused', 'completed'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestTripError) throw latestTripError;
      resolvedTripId = latestTrip?.id || null;
    }

    if (!resolvedTripId) {
      return NextResponse.json({ error: '이수 기록을 연결할 운행기록을 찾을 수 없습니다.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('vehicle_trip_logs')
      .select('id, created_at')
      .eq('trip_id', resolvedTripId)
      .eq('field_name', 'safety_education')
      .like('new_value', `${notice_id}%`)
      .maybeSingle();
    const completedAt = new Date().toISOString();
    if (existing?.id) return NextResponse.json({ completed: true, duplicated: true, trip_id: resolvedTripId, completed_at: existing.created_at || completedAt });

    const { error } = await supabase.from('vehicle_trip_logs').insert({
      trip_id: resolvedTripId,
      field_name: 'safety_education',
      modified_by: completed_by || driver_name || vehicle_number || 'driver',
      old_value: vehicle_number || '-',
      new_value: makeEducationLogValue(notice_id, title),
      created_at: completedAt,
    });
    if (error) throw error;
    return NextResponse.json({ completed: true, trip_id: resolvedTripId, completed_at: completedAt });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
