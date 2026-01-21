import { NextResponse } from 'next/server';
import { getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';

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
        const buffer = await client.getFileContents(path);
        const fileName = path.split('/').pop();
        const isDownload = searchParams.get('download') === 'true';

        // Determine content type by extension
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
            'ppt': 'application/vnd.ms-powerpoint'
        };

        const headers = {
            'Content-Type': mimeMap[ext] || 'application/octet-stream',
            // Aggressive caching: 1 year, immutable
            'Cache-Control': 'public, max-age=31536000, immutable'
        };

        if (isDownload || !mimeMap[ext]) {
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(fileName)}"`;
        }

        return new Response(buffer, { headers });
    } catch (error) {
        console.error('NAS Preview Error:', error);
        return new Response('Failed to load file', { status: 500 });
    }
}
