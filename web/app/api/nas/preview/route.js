import { NextResponse } from 'next/server';
import { getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';
import { logActivityServer } from '@/utils/loggerServer';

export async function GET(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
        return new Response('Path is required', { status: 400 });
    }

    try {
        const client = getNasClient();

        // 1. Get file stats first (for Content-Length)
        const stat = await client.stat(path);

        // 2. Create Read Stream instead of buffering entire file
        const nodeStream = client.createReadStream(path);
        const isDownload = searchParams.get('download') === 'true';

        // Log the activity
        const fileName = path.split('/').pop();
        await logActivityServer(isDownload ? 'DOWNLOAD' : 'FILE_VIEW', path, { fileName, size: stat.size });

        // Determine content type
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeMap = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf',
            'hwp': 'application/x-hwp',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'ppt': 'application/vnd.ms-powerpoint',
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'zip': 'application/zip'
        };

        const headers = {
            'Content-Type': mimeMap[ext] || 'application/octet-stream',
            'Content-Length': stat.size, // Crucial for download progress bar
            // Aggressive caching: 1 year, immutable
            'Cache-Control': 'public, max-age=31536000, immutable'
        };

        if (isDownload || !mimeMap[ext]) {
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(fileName)}"`;
        }

        // 3. Convert Node Stream to Web ReadableStream
        const webStream = new ReadableStream({
            start(controller) {
                nodeStream.on('data', (chunk) => controller.enqueue(chunk));
                nodeStream.on('end', () => controller.close());
                nodeStream.on('error', (err) => controller.error(err));
            }
        });

        return new Response(webStream, { headers });
    } catch (error) {
        console.error('NAS Preview/Download Error:', error);
        return new Response('Failed to load file', { status: 500 });
    }
}
