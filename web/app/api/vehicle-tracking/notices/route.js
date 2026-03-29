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

export async function POST(request) {
  const supabase = await createAdminClient();
  try {
    const body = await request.json();
    const { data, error } = await supabase.from('notices').insert([body]).select().single();
    if (error) throw error;
    return NextResponse.json({ notice: data });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function PUT(request) {
  const supabase = await createAdminClient();
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    const { data, error } = await supabase.from('notices').update(updateData).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ notice: data });
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
