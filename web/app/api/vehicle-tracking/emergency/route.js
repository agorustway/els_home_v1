import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

/**
 * GET  /api/vehicle-tracking/emergency?unread=true
 * POST /api/vehicle-tracking/emergency  { message, title }
 *
 * Supabase 테이블: emergency_notices
 *   id, title, message, created_at, created_by, expires_at
 */

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// 앱에서 미수신 긴급알림 폴링
export async function GET(request) {
  const supabase = await createAdminClient();
  const { searchParams } = new URL(request.url);
  const unread = searchParams.get('unread') === 'true';

  try {
    let query = supabase
      .from('emergency_notices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    // 최근 24시간 이내 알림만 조회
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', since);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ items: data || [] }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// 관리자(웹)에서 긴급알림 발송
export async function POST(request) {
  const supabase = await createAdminClient();

  try {
    const body = await request.json();
    const { title = '긴급 알림', message } = body;

    if (!message) {
      return NextResponse.json({ error: '메시지는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('emergency_notices')
      .insert([{ title, message, created_at: new Date().toISOString() }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id, created: true }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
