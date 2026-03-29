import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel timeout 대비 (필요시)

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

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const idsStr = searchParams.get('ids');

    if (!idsStr) {
        return new Response('No trip IDs provided.', { status: 400 });
    }

    const ids = idsStr.split(',');

    const supabase = await createAdminClient();
    const { data: trips, error } = await supabase
        .from('vehicle_trips')
        .select('*')
        .in('id', ids);

    if (error || !trips || trips.length === 0) {
        console.error('[ZIP-EXPORT] Trips not found or error:', error, ids);
        return new NextResponse(`선택한 운행 기록(${ids.length}건)을 찾을 수 없거나 데이터베이스 오류가 발생했습니다.`, { status: 404 });
    }

    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(passThrough);

    // We need an async IIFE to run archive.append sequentially and then archive.finalize()
    (async () => {
        try {
            for (const trip of trips) {
                if (!trip.photos || trip.photos.length === 0) continue;

                // Format: YYYYMMDD_Vehicle_Container
                const dateStr = trip.started_at ? trip.started_at.split('T')[0].replace(/-/g, '') : 'UnknownDate';
                let folderName = `${dateStr}_${trip.vehicle_number || '차량미상'}`;
                if (trip.container_number) folderName += `_${trip.container_number}`;
                else folderName += `_컨테이너없음`;

                for (let i = 0; i < trip.photos.length; i++) {
                    const p = trip.photos[i];
                    const fileName = `${folderName}/photo_${i + 1}.jpg`;

                    if (p.key) {
                        try {
                            const command = new GetObjectCommand({
                                Bucket: BUCKET,
                                Key: decodeURIComponent(p.key),
                            });
                            const s3Res = await s3.send(command);
                            // s3Res.Body is a Node-like stream in Node environment
                            archive.append(s3Res.Body, { name: fileName });
                        } catch (err) {
                            console.error(`Error adding S3 photo ${p.key} to ZIP:`, err);
                            archive.append(Buffer.from(`Error loading image: ${err.message}`), { name: `${fileName}.error.txt` });
                        }
                    } else if (p.url) {
                        try {
                            // Some external URLs might simply be fetched via HTTP
                            const httpRes = await fetch(p.url);
                            if (httpRes.ok) {
                                // Web stream to node buffer or we can just get arrayBuffer
                                const arrBuf = await httpRes.arrayBuffer();
                                archive.append(Buffer.from(arrBuf), { name: fileName });
                            } else {
                                archive.append(Buffer.from('HTTP Error loading external image'), { name: `${fileName}.error.txt` });
                            }
                        } catch (err) {
                            console.error('Error fetching external photo:', err);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error generating archive:', err);
            archive.append(Buffer.from('Fatal error creating zip: ' + err.message), { name: 'FATAL_ERROR.txt' });
        } finally {
            archive.finalize();
        }
    })();

    return new NextResponse(passThrough, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="photos_export_${new Date().toISOString().slice(0, 10)}.zip"`,
            'Cache-Control': 'no-store, max-age=0',
        }
    });
}
