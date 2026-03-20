import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import { Readable } from 'stream';

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

export async function GET(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;

    try {
        // 1. 운행 정보 및 사진 목록 조회
        const { data: trip, error: tripError } = await supabase
            .from('vehicle_trips')
            .select('*')
            .eq('id', id)
            .single();

        if (tripError || !trip) throw new Error('운행 정보를 찾을 수 없습니다.');
        const photos = trip.photos || [];
        if (photos.length === 0) throw new Error('다운로드할 사진이 없습니다.');

        // 2. 파일명 구성 (연월일-차량번호-컨테이너번호.ZIP)
        const dateStr = new Date(trip.started_at).toISOString().slice(0, 10).replace(/-/g, '');
        const vNum = trip.vehicle_number.replace(/\s/g, '');
        const cNum = trip.container_number || '미입력';
        const zipName = `${dateStr}-${vNum}-${cNum}.zip`;

        const archive = archiver('zip', { zlib: { level: 9 } });

        // 사진 파일 하나씩 압축에 추가 (순차 처리)
        for (const photo of photos) {
            try {
                const getObj = new GetObjectCommand({ Bucket: BUCKET, Key: photo.key });
                const { Body } = await s3.send(getObj);
                
                // S3 스트림을 버퍼로 변환 
                const chunks = [];
                for await (const chunk of Body) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                
                archive.append(buffer, { name: photo.name || `photo_${Date.now()}.jpg` });
            } catch (e) {
                console.error(`File download error (${photo.key}):`, e);
            }
        }

        // 스트림을 프로미스로 래핑하여 버퍼로 수집
        const buffer = await new Promise((resolve, reject) => {
            const chunks = [];
            archive.on('data', (chunk) => chunks.push(chunk));
            archive.on('end', () => resolve(Buffer.concat(chunks)));
            archive.on('error', (err) => reject(err));
            archive.finalize();
        });

        return new Response(buffer, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
            },
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
