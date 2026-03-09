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

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    try {
        // Proxy Download (Serve file from S3 to Client)
        const { buffer, contentType } = await getFileBufferFromS3(key);
        const fileName = searchParams.get('name') || key.split('/').pop();

        // Background logging
        logActivityServer('FILE_VIEW', key, { source: 's3' }).catch(console.error);

        const encodedFileName = encodeURIComponent(fileName);
        const safeName = fileName.replace(/[^\x20-\x7E]/g, '_');

        // Better Content-Type mapping
        let finalContentType = contentType;
        if (!finalContentType || finalContentType === 'application/octet-stream') {
            const ext = fileName.split('.').pop().toLowerCase();
            const mimeMap = {
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'xls': 'application/vnd.ms-excel',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'doc': 'application/msword',
                'pdf': 'application/pdf',
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'txt': 'text/plain',
                'csv': 'text/csv',
                'zip': 'application/zip'
            };
            finalContentType = mimeMap[ext] || 'application/octet-stream';
        }

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': finalContentType,
                'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodedFileName}`,
                'Cache-Control': 'no-cache',
                'Content-Length': buffer.length.toString(),
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
