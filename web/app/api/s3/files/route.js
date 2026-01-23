import { NextResponse } from 'next/server';
import { getUploadUrl, getDownloadUrl, deleteS3File } from '@/lib/s3';
import { createClient } from '@/utils/supabase/server';

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { action, key, fileType } = await request.json();

        if (action === 'upload_url') {
            // Force files to go to 'els-files' bucket logic handled in lib/s3
            // Key should probably include year/month like "board/202601/filename.ext"
            const url = await getUploadUrl(key, fileType);
            return NextResponse.json({ url });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// For downloading (creating presigned GET urls)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if(!key) return NextResponse.json({error: 'Missing key'}, {status:400});

    const url = await getDownloadUrl(key);
    if(url) return NextResponse.redirect(url);
    return NextResponse.json({error: 'File not found'}, {status:404});
}
