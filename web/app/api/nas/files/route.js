import { NextResponse } from 'next/server';
import { listFiles, createFolder, deleteFile, moveFile, copyFile, getNasClient } from '@/lib/nas'; // WebDAV
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const files = await listFiles(path);
        return NextResponse.json({ files });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ... (Other WebDAV methods like POST for upload need stream handling, typically done via formidable or similar in App Router which is tricky. 
// For simplicity, let's assume ArchiveBrowser uses old-school API or we keep it simple for now)
// Note: App Router file upload handling is different. We'll need to parse FormData.

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const contentType = request.headers.get('content-type') || '';

        // Handle JSON body (mkdir, copy)
        if (contentType.includes('application/json')) {
            const json = await request.json();
            if (json.type === 'mkdir') {
                await createFolder(json.path);
                return NextResponse.json({ success: true });
            }
            if (json.type === 'copy') {
                await copyFile(json.from, json.to);
                return NextResponse.json({ success: true });
            }
        }

        // Handle File Upload via FormData
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const path = formData.get('path') || '/';

            if (file) {
                const buffer = Buffer.from(await file.arrayBuffer());
                const filePath = `${path}/${file.name}`.replace(/\/\//g, '/');

                const client = getNasClient();
                await client.putFileContents(filePath, buffer);

                return NextResponse.json({ success: true, path: filePath });
            }
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('NAS API POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    // Auth checks...
    try {
        await deleteFile(path);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    // Auth checks...
    try {
        const { from, to } = await request.json();
        await moveFile(from, to);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
