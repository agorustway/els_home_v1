import { NextResponse } from 'next/server';
import { getNasClient } from '@/lib/nas';
import { createClient } from '@/utils/supabase/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { paths } = await request.json();
        console.log('Zipping paths:', paths);

        if (!paths || !Array.isArray(paths) || paths.length === 0) {
            return NextResponse.json({ error: 'Paths are required' }, { status: 400 });
        }

        const client = getNasClient();

        // Create archiver instance
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Use PassThrough to bridge Node.js stream to Web Stream
        const passThrough = new PassThrough();
        archive.pipe(passThrough);

        // Process files in the background but finalize the archive
        // We'll return a ReadableStream that consumes the PassThrough
        const stream = new ReadableStream({
            start(controller) {
                passThrough.on('data', (chunk) => controller.enqueue(chunk));
                passThrough.on('end', () => controller.close());
                passThrough.on('error', (err) => controller.error(err));
            }
        });

        // We need to start adding files to the archive
        // We do this without blocking the response return
        (async () => {
            try {
                for (const path of paths) {
                    try {
                        const stat = await client.stat(path);
                        if (stat.type === 'directory') {
                            await addRecursive(client, archive, path, '');
                        } else {
                            const buffer = await client.getFileContents(path);
                            const fileName = path.split('/').pop();
                            archive.append(buffer, { name: fileName });
                            console.log('Added to zip:', fileName);
                        }
                    } catch (err) {
                        console.error(`Failed to add ${path}:`, err);
                    }
                }
                archive.finalize();
            } catch (err) {
                console.error('Archiver error:', err);
                archive.abort();
            }
        })();

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="nas_download_${new Date().getTime()}.zip"`,
            }
        });

    } catch (error) {
        console.error('NAS Zip Route Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

async function addRecursive(client, archive, fullPath, zipPath) {
    const dirName = fullPath.split('/').pop();
    const currentZipPath = zipPath ? `${zipPath}/${dirName}` : dirName;

    // Add directory entry
    archive.append('', { name: currentZipPath + '/' });

    try {
        const items = await client.getDirectoryContents(fullPath);
        for (const item of items) {
            if (item.basename === '.' || item.basename === '..') continue;

            if (item.type === 'directory') {
                await addRecursive(client, archive, item.filename, currentZipPath);
            } else {
                const buffer = await client.getFileContents(item.filename);
                archive.append(buffer, { name: `${currentZipPath}/${item.basename}` });
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${fullPath}:`, err);
    }
}
