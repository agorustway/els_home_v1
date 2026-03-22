import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
const PHOTO_PREFIX = 'vehicle-tracking/photos';

/**
 * POST /api/vehicle-tracking/photos
 * 사진 업로드 (multipart/form-data)
 * - trip_id: 운행 ID
 * - photos: 파일 (multiple)
 */
export async function POST(request) {
    const supabase = await createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    try {
        let tripId;
        let filesData = [];

        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            const body = await request.json();
            tripId = body.trip_id;
            if (body.photos && Array.isArray(body.photos)) {
                filesData = body.photos; // { name, type, base64 }
            }
        } else {
            const formData = await request.formData();
            tripId = formData.get('trip_id');
            const files = formData.getAll('photos');
            for (const file of files) {
                if (!(file instanceof File)) continue;
                filesData.push({
                    name: file.name,
                    type: file.type || 'image/jpeg',
                    buffer: Buffer.from(await file.arrayBuffer())
                });
            }
        }

        if (!tripId) {
            return NextResponse.json({ error: 'trip_id는 필수입니다.' }, { status: 400 });
        }

        if (filesData.length === 0) {
            return NextResponse.json({ error: '업로드할 사진이 없습니다.' }, { status: 400 });
        }

        // 기존 사진 수 확인
        const { data: trip } = await supabase
            .from('vehicle_trips')
            .select('photos')
            .eq('id', tripId)
            .single();

        const existingPhotos = trip?.photos || [];
        if (existingPhotos.length + filesData.length > 10) {
            return NextResponse.json({ error: '사진은 최대 10장까지 가능합니다.' }, { status: 400 });
        }

        const uploadedUrls = [];

        for (const file of filesData) {
            let buffer;
            if (file.buffer) {
                buffer = file.buffer;
            } else if (file.base64) {
                buffer = Buffer.from(file.base64, 'base64');
            } else {
                continue;
            }

            const ext = file.name.split('.').pop() || 'jpg';
            const timestamp = Date.now();
            const key = `${PHOTO_PREFIX}/${tripId}/${timestamp}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: file.type || 'image/jpeg',
            }));

            // 접근 URL 구성 (직접 S3 URL 대신 프록시 API 사용)
            const url = `/api/vehicle-tracking/photos/view?key=${encodeURIComponent(key)}`;
            uploadedUrls.push({
                url,
                key,
                name: file.name,
                size: file.size,
                uploadedAt: new Date().toISOString(),
            });
        }

        // DB에 사진 URL 추가
        const allPhotos = [...existingPhotos, ...uploadedUrls];
        const { error: updateError } = await supabase
            .from('vehicle_trips')
            .update({ photos: allPhotos, updated_at: new Date().toISOString() })
            .eq('id', tripId);

        if (updateError) throw updateError;

        return NextResponse.json({
            photos: allPhotos,
            uploaded: uploadedUrls.length,
        });
    } catch (error) {
        console.error('사진 업로드 오류:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
