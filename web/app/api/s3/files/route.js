import { NextResponse } from 'next/server';
import { getUploadUrl, uploadFileToS3, getFileStreamFromS3 } from '@/lib/s3'; // Need to export getFileStreamFromS3
import { createClient } from '@/utils/supabase/server';

// ... POST method ...

// Proxy Download (Stream file from S3 to Client)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if(!key) return NextResponse.json({error: 'Missing key'}, {status:400});

    try {
        // Stream from S3
        const { stream, contentType } = await getFileStreamFromS3(key);
        
        return new NextResponse(stream, {
            headers: {
                'Content-Type': contentType || 'application/octet-stream',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error("S3 Proxy Error:", error);
        return NextResponse.json({error: 'File not found'}, {status:404});
    }
}
