import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import https from "https";

const s3Client = new S3Client({
    region: process.env.NAS_REGION || "us-east-1",
    endpoint: process.env.NAS_ENDPOINT,
    credentials: {
        accessKeyId: process.env.NAS_ACCESS_KEY,
        secretAccessKey: process.env.NAS_SECRET_KEY,
    },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
    }),
    // Disable checksums to avoid CORS preflight issues with custom headers
    responseChecksums: 'none',
});

const BUCKET = process.env.NAS_BUCKET || 'els-files';

export async function uploadFileToS3(key, buffer, contentType) {
    try {
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        });
        await s3Client.send(command);
        return true;
    } catch (error) {
        console.error("S3 Server Upload Error:", error);
        throw error;
    }
}

export async function getFileStreamFromS3(key) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });
        const response = await s3Client.send(command);
        return {
            stream: response.Body.transformToWebStream(), // Convert to Web Stream for Next.js
            contentType: response.ContentType,
        };
    } catch (error) {
        console.error("S3 Get Stream Error:", error);
        throw error;
    }
}

export async function getUploadUrl(key, contentType) {
    try {
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: contentType,
        });
        return await getSignedUrl(s3Client, command, { expiresIn: 600 });
    } catch (error) {
        console.error("S3 Upload Sign Error:", error);
        return null;
    }
}

export async function getDownloadUrl(key) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });
        return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (error) {
        console.error("S3 Download Sign Error:", error);
        return null;
    }
}

export async function deleteS3File(key) {
    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch (error) {
        console.error("S3 Delete Error:", error);
        return false;
    }
}
