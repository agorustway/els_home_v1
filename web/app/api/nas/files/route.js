import { NextResponse } from 'next/server';
import { listFiles, createFolder, deleteFile, moveFile, copyFile } from '@/lib/nas'; // WebDAV
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
        const formData = await request.formData();
        const file = formData.get('file');
        const path = formData.get('path') || '/';
        const type = formData.get('type'); // mkdir, copy, etc.

        // Handle JSON body requests (mkdir, copy)
        if (!file && !type) {
             const json = await request.json().catch(() => ({}));
             if (json.type === 'mkdir') {
                 await createFolder(json.path);
                 return NextResponse.json({ success: true });
             }
             if (json.type === 'copy') {
                 await copyFile(json.from, json.to);
                 return NextResponse.json({ success: true });
             }
        }
        
        // Handle File Upload
        if (file) {
            // WebDAV upload implementation in Next.js App Router is complex because we need a stream.
            // But we can convert Blob to Buffer.
            const buffer = Buffer.from(await file.arrayBuffer());
            const filePath = `${path}/${file.name}`.replace('//', '/');
            
            // We need to import client from lib/nas to use putFileContents or similar
            // But lib/nas exports helpers. Let's add upload helper there using buffer.
            
            // Re-implementing upload in lib/nas using buffer:
            const { createClient } = require("webdav");
            const client = createClient(process.env.NAS_URL, {
                username: process.env.NAS_USER,
                password: process.env.NAS_PW
            });
            await client.putFileContents(filePath, buffer);
            
            return NextResponse.json({ success: true, path: filePath });
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
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
    } catch(e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    // Auth checks...
    try {
        const { from, to } = await request.json();
        await moveFile(from, to);
        return NextResponse.json({ success: true });
    } catch(e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
