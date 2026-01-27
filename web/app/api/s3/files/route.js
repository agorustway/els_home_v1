import { NextResponse } from 'next/server';
import { getUploadUrl, uploadFileToS3, getFileBufferFromS3 } from '@/lib/s3';
import { createClient } from '@/utils/supabase/server';
import { logActivityServer } from '@/utils/loggerServer';

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { action, key, fileType } = body;

            if (action === 'upload_url') {
                const url = await getUploadUrl(key, fileType);
                if (!url) throw new Error('Could not generate upload URL');
                return NextResponse.json({ url });
            }
        }

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const { key } = Object.fromEntries(formData.entries());
            const file = formData.get('file');

            if (!file || !key) throw new Error('File or key missing');

            const buffer = Buffer.from(await file.arrayBuffer());
            await uploadFileToS3(key, buffer, file.type);

            return NextResponse.json({ success: true, key });
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('SERVER S3 API ERROR:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
        return NextResponse.json({
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
}

// Proxy Download (Serve file from S3 to Client)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    try {
        const { buffer, contentType } = await getFileBufferFromS3(key);

        // Background logging
        logActivityServer('FILE_VIEW', key, { source: 's3' }).catch(console.error);

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType || 'application/octet-stream',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Length': buffer.length.toString(),
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error(`S3 Proxy Error [Key: ${key}]:`, error);
        return NextResponse.json({
            error: 'File not found or connection failed',
            details: error.message
        }, { status: 404 });
    }
}
