import { NextResponse } from 'next/server';
import { uploadFileToS3, deleteS3File } from '@/lib/s3';

export async function GET() {
    const debugInfo = {
        NAS_ENDPOINT: !!process.env.NAS_ENDPOINT,
        NAS_REGION: process.env.NAS_REGION || 'default',
        NAS_BUCKET: process.env.NAS_BUCKET || 'els-files',
        NAS_ACCESS_KEY_EXISTS: !!process.env.NAS_ACCESS_KEY,
        NAS_SECRET_KEY_EXISTS: !!process.env.NAS_SECRET_KEY,
    };

    const testKey = `test/s3_connection_check_${Date.now()}.txt`;
    const testContent = Buffer.from('This is a test file to verify S3 connectivity.');

    try {
        // 1. Upload Test
        const uploadStart = Date.now();
        await uploadFileToS3(testKey, testContent, 'text/plain');
        const uploadTime = Date.now() - uploadStart;

        // 2. Delete Test (Cleanup)
        // await deleteS3File(testKey); 

        return NextResponse.json({
            status: 'success',
            message: 'S3 upload successful',
            uploadTime: `${uploadTime}ms`,
            testKey,
            env: debugInfo
        });
    } catch (error) {
        return NextResponse.json({
            status: 'error',
            message: error.message,
            stack: error.stack,
            env: debugInfo,
            cause: error.cause ? JSON.stringify(error.cause) : undefined
        }, { status: 500 });
    }
}
