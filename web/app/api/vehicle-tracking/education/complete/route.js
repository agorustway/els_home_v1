import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import { makeEducationLogValue } from '@/utils/vehicleEducation.mjs';

export async function POST(request) {
  const supabase = await createAdminClient();
  try {
    const body = await request.json();
    const { trip_id, notice_id, title, driver_name, vehicle_number, completed_by } = body;
    if (!trip_id) return NextResponse.json({ error: 'trip_id는 필수입니다.' }, { status: 400 });
    if (!notice_id) return NextResponse.json({ error: 'notice_id는 필수입니다.' }, { status: 400 });

    const { data: existing } = await supabase
      .from('vehicle_trip_logs')
      .select('id')
      .eq('trip_id', trip_id)
      .eq('field_name', 'safety_education')
      .like('new_value', `${notice_id}%`)
      .maybeSingle();
    if (existing?.id) return NextResponse.json({ completed: true, duplicated: true });

    const { error } = await supabase.from('vehicle_trip_logs').insert({
      trip_id,
      field_name: 'safety_education',
      modified_by: completed_by || driver_name || vehicle_number || 'driver',
      old_value: vehicle_number || '-',
      new_value: makeEducationLogValue(notice_id, title),
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ completed: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
