import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { uploadFileToS3 } from '@/lib/s3';

const BUCKET_FOLDER = 'weekly-menus';

// GET: 최신 식단 조회
export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const branch = searchParams.get('branch') || 'asan';
    const type = searchParams.get('type') || 'lunchbox';

    // 가장 최신 날짜의 식단 1개 조회
    const { data, error } = await supabase
        .from('weekly_menus')
        .select('*')
        .eq('branch_code', branch)
        .eq('menu_type', type)
        .order('week_start_date', { ascending: false })
        .limit(12);

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching menu:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || null });
}

// POST: 식단 업로드 및 저장
export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const weekStartDate = formData.get('week_start_date');
        const branch = formData.get('branch') || 'asan';
        const type = formData.get('type') || 'lunchbox';

        if (!file || !weekStartDate) {
            return NextResponse.json({ error: 'File and Date are required' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop();
        const fileName = `${branch}_${type}_${weekStartDate}_${Date.now()}.${ext}`;
        const key = `${BUCKET_FOLDER}/${fileName}`;

        await uploadFileToS3(key, buffer, file.type);

        const { data: existing } = await supabase
            .from('weekly_menus')
            .select('id')
            .eq('branch_code', branch)
            .eq('menu_type', type)
            .eq('week_start_date', weekStartDate)
            .single();

        let result;
        if (existing) {
            result = await supabase
                .from('weekly_menus')
                .update({
                    image_url: key,
                    file_name: file.name,
                    updated_at: new Date().toISOString(),
                    created_by: user.id
                })
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            result = await supabase
                .from('weekly_menus')
                .insert({
                    branch_code: branch,
                    menu_type: type,
                    week_start_date: weekStartDate,
                    image_url: key,
                    file_name: file.name,
                    created_by: user.id
                })
                .select()
                .single();
        }

        if (result.error) throw result.error;
        return NextResponse.json({ success: true, data: result.data });

    } catch (error) {
        console.error('Upload Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: 식단 삭제
export async function DELETE(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 관리자 권한 체크
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const adminSupabase = await createAdminClient();

        // 1. 기존 데이터 조회 (이미지 경로 확보)
        const { data: menu, error: fetchError } = await adminSupabase
            .from('weekly_menus')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !menu) {
            return NextResponse.json({ error: 'Menu not found' }, { status: 404 });
        }

        // 2. S3 파일 삭제
        if (menu.image_url) {
            const { deleteS3File } = await import('@/lib/s3');
            await deleteS3File(menu.image_url);
        }

        // 3. DB 삭제
        const { error: deleteError } = await adminSupabase
            .from('weekly_menus')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Delete Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
