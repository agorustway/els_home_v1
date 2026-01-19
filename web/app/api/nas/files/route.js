import { NextResponse } from 'next/server';
import { getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '/';

    try {
        console.log('Fetching NAS files for path:', path);
        const client = getNasClient();
        const directoryItems = await client.getDirectoryContents(path);
        console.log(`NAS Items for ${path}:`, directoryItems.map(i => ({ name: i.basename, type: i.type })));
        console.log(`Found ${directoryItems.length} items in NAS`);

        // Filter out the current directory itself if it appears in the list (WebDAV quirk)
        const files = directoryItems
            .filter(item => item.basename !== '' && item.basename !== '.' && item.basename !== path.split('/').pop())
            .map(item => ({
                name: item.basename,
                type: item.type, // 'directory' or 'file'
                size: item.size,
                lastMod: item.lastmod,
                mime: item.mime,
                path: item.filename
            }));

        return NextResponse.json({ files });
    } catch (error) {
        console.error('NAS Error Details:', error);
        return NextResponse.json({
            error: 'Failed to fetch files from NAS',
            details: error.message
        }, { status: 500 });
    }
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const contentType = request.headers.get('content-type') || '';
        const client = getNasClient();

        // Handle Folder Creation
        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { type, path } = body;

            if (type === 'mkdir') {
                if (await client.exists(path) === false) {
                    await client.createDirectory(path);
                }
                return NextResponse.json({ success: true });
            }
        }
        // Handle File Upload
        else if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const path = formData.get('path') || '/';

            if (!file) {
                return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            const fileName = file.name;
            const fullPath = `${path}/${fileName}`.replace(/\/+/g, '/');

            await client.putFileContents(fullPath, buffer, { overwrite: false });
            return NextResponse.json({ success: true, path: fullPath });
        }

        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });

    } catch (error) {
        console.error('NAS Write Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const path = searchParams.get('path');

        if (!path) {
            return NextResponse.json({ error: 'Path is required' }, { status: 400 });
        }

        const client = getNasClient();
        if (await client.exists(path)) {
            await client.deleteFile(path);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('NAS Delete Error:', error);
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }
}
