import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

function preserveEducationUrlInContent(payload = {}) {
  const next = { ...payload };
  const url = String(next.education_url || '').trim();
  if (!url) return next;
  const content = String(next.content || next.body || next.message || '').trim();
  if (!content.includes(url)) {
    next.content = content ? `${content}\n\n${url}` : url;
  }
  return next;
}

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

// notices 테이블에 안전하게 insert/update (없는 컬럼 자동 제거 후 재시도)
async function safeMutate(supabase, mode, payload) {
  const attempt = async (data) => {
    if (mode === 'insert') {
      const { data: row, error } = await supabase.from('notices').insert([data]).select().single();
      if (error) throw error;
      return row;
    } else {
      const { id, ...updateData } = data;
      const { data: row, error } = await supabase.from('notices').update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return row;
    }
  };

  try {
    return await attempt(payload);
  } catch (e) {
    // schema cache 오류(없는 컬럼)이면 extended 필드 제거 후 재시도
    if (e.message?.includes('column') || e.message?.includes('schema') || e.code === 'PGRST204') {
      const { education_url, attachments, ...safe } = payload;
      return await attempt(safe);
    }
    throw e;
  }
}

export async function POST(request) {
  const supabase = await createAdminClient();
  try {
    const body = await request.json();
    const row = await safeMutate(supabase, 'insert', preserveEducationUrlInContent(body));
    return NextResponse.json({ notice: row });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PUT(request) {
  const supabase = await createAdminClient();
  try {
    const body = await request.json();
    const row = await safeMutate(supabase, 'update', preserveEducationUrlInContent(body));
    return NextResponse.json({ notice: row });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(request) {
  const supabase = await createAdminClient();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const { error } = await supabase.from('notices').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
