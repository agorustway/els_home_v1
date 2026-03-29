import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
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
const DRIVER_PHOTO_PREFIX = 'driver-profiles';

/**
 * POST /api/vehicle-tracking/driver-photos
 * 기사 프로필 사진 업로드 (base64 JSON)
 * Body: { phone, type, base64, mimeType? }
 * - type: 'driver' | 'vehicle' | 'chassis'
 * Returns: { url } — S3 proxy URL
 */
export async function POST(request) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { phone, type, base64, mimeType = 'image/jpeg' } = body;

        if (!phone || !type || !base64) {
            return NextResponse.json({ error: 'phone, type, base64는 필수입니다.' }, { status: 400 });
        }
        if (!['driver', 'vehicle', 'chassis'].includes(type)) {
            return NextResponse.json({ error: '유효하지 않은 type입니다. (driver|vehicle|chassis)' }, { status: 400 });
        }

        const cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 8) {
            return NextResponse.json({ error: '유효하지 않은 전화번호' }, { status: 400 });
        }

        // base64 → Buffer
        const buffer = Buffer.from(base64, 'base64');
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const key = `${DRIVER_PHOTO_PREFIX}/${cleanPhone}/${type}_${Date.now()}.${ext}`;

        try {
            await s3.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
            }));
        } catch (s3Error) {
            console.error(`[NAS] 기사 프로필 사진 S3 에러 (${key}):`, s3Error);
            return NextResponse.json({ error: `NAS 전송 실패: ${s3Error.message}` }, { status: 500 });
        }

        // 프록시 URL (view API 경유)
        const url = `/api/vehicle-tracking/photos/view?key=${encodeURIComponent(key)}`;

        // driver_contacts 테이블에도 즉시 반영
        const last8 = cleanPhone.slice(-8);
        const p1 = last8.slice(0, 4);
        const p2 = last8.slice(4, 8);

        const { data: existing } = await supabase
            .from('driver_contacts')
            .select('id')
            .ilike('phone', `%${p1}%${p2}%`)
            .maybeSingle();

        if (existing) {
            const colName = `photo_${type}`;
            await supabase
                .from('driver_contacts')
                .update({ [colName]: url })
                .eq('id', existing.id);
        }

        return NextResponse.json({ url, key });

    } catch (error) {
        console.error('기사 사진 업로드 오류:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
