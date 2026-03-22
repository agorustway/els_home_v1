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
    let key = searchParams.get('key');

    if (!key) {
        return new Response('Key is required', { status: 400 });
    }

    // [중요] URL 인코딩된 키를 한 번 더 풀어서 NAS(S3) 실제 경로와 맞춰줌
    key = decodeURIComponent(key);

    try {
        console.log(`[NAS-VIEW] 이미지 요청: bucket=${BUCKET}, key=${key}`);
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const response = await s3.send(command);
        console.log(`[NAS-VIEW] S3 응답 성공: type=${response.ContentType}, length=${response.ContentLength}`);
        
        // [중요] transformToUint8Array가 없는 환경을 위해 더 호환성 좋은 방식 사용
        const bytes = await response.Body.transformToByteArray();
        const data = new Uint8Array(bytes);

        return new Response(data, {
            headers: {
                'Content-Type': response.ContentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error(`[NAS-VIEW-ERROR] ${key}:`, error);
        
        // 형이 앱에서 볼 수 있게 에러 메시지를 텍스트로 보냄
        const errorMsg = `NAS 에러: ${error.message} (BUCKET: ${BUCKET}, KEY: ${key}, ENDPOINT: ${process.env.NAS_ENDPOINT})`;
        return new Response(errorMsg, { 
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}
