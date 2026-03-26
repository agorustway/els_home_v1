import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// 앱에서 공지사항 조회
export async function GET(request) {
  const supabase = await createAdminClient();

  try {
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ notices: data || [] }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
