import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
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
    // .single(); // 리스트로 반환해야 하므로 single() 제거

    if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
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

    // TODO: 관리자 권한 체크 추가 가능 (현재는 로그인한 사용자면 가능하게)

    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const weekStartDate = formData.get('week_start_date');
        const branch = formData.get('branch') || 'asan';
        const type = formData.get('type') || 'lunchbox';

        if (!file || !weekStartDate) {
            return NextResponse.json({ error: 'File and Date are required' }, { status: 400 });
        }

        // 1. Upload to S3
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop();
        const fileName = `${branch}_${type}_${weekStartDate}_${Date.now()}.${ext}`;
        const key = `${BUCKET_FOLDER}/${fileName}`;

        await uploadFileToS3(key, buffer, file.type);

        // 2. DB Insert/Update
        // 먼저 해당 날짜에 데이터가 있는지 확인
        const { data: existing } = await supabase
            .from('weekly_menus')
            .select('id')
            .eq('branch_code', branch)
            .eq('menu_type', type)
            .eq('week_start_date', weekStartDate)
            .single();

        let result;
        if (existing) {
            // Update
            result = await supabase
                .from('weekly_menus')
                .update({
                    image_url: key, // Store S3 Key
                    file_name: file.name,
                    updated_at: new Date().toISOString(),
                    created_by: user.id
                })
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            // Insert
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
