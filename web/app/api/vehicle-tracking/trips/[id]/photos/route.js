import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
 * DELETE /api/vehicle-tracking/trips/[id]/photos
 * 특정 사진 삭제
 */
export async function DELETE(request, { params }) {
    const { id } = params;
    const { key } = await request.json();
    const supabase = await createClient();

    if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });

    try {
        // 1. DB에서 해당 trip 조회
        const { data: trip, error: fetchError } = await supabase
            .from('vehicle_trips')
            .select('photos')
            .eq('id', id)
            .single();

        if (fetchError || !trip) throw new Error('Trip not found');

        // 2. 사진 배열에서 해당 key 제거
        const updatedPhotos = (trip.photos || []).filter(p => p.key !== key);

        // 3. DB 업데이트
        const { error: updateError } = await supabase
            .from('vehicle_trips')
            .update({ photos: updatedPhotos, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (updateError) throw updateError;

        // 4. S3(NAS)에서 실제 파일 삭제 (선택 사항이지만 권장)
        try {
            await s3.send(new DeleteObjectCommand({
                Bucket: BUCKET,
                Key: key
            }));
        } catch (s3Error) {
            console.warn('S3 delete failed (DB was updated):', s3Error);
        }

        return NextResponse.json({ success: true, photos: updatedPhotos });
    } catch (error) {
        console.error('Delete photo error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
