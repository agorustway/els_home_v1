import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
    region: process.env.NAS_REGION || 'us-east-1',
    endpoint: process.env.NAS_ENDPOINT,
    credentials: {
        accessKeyId: process.env.NAS_ACCESS_KEY,
        secretAccessKey: process.env.NAS_SECRET_KEY,
    },
    forcePathStyle: true,
    tls: true,
});

const BUCKET = process.env.NAS_BUCKET || 'els-files';

/**
 * GET /api/vehicle-tracking/photos/view?key=...
 * S3 이미지 프록시 (내부 서버만 접근 가능한 NAS 이미지를 외부에 전달)
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
        return new Response('Key is required', { status: 400 });
    }

    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const response = await s3.send(command);
        const data = await response.Body.transformToUint8Array();

        return new Response(data, {
            headers: {
                'Content-Type': response.ContentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Photo Proxy Error:', error);
        return new Response('Photo not found', { status: 404 });
    }
}
