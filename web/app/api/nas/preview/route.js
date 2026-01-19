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

        // Determine content type by extension
        const ext = path.split('.').pop().toLowerCase();
        const mimeMap = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf'
        };

        return new Response(buffer, {
            headers: {
                'Content-Type': mimeMap[ext] || 'application/octet-stream',
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (error) {
        console.error('NAS Preview Error:', error);
        return new Response('Failed to load preview', { status: 500 });
    }
}
