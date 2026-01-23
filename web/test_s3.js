const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
require('dotenv').config({ path: '.env.local' });

async function testS3() {
    console.log("Testing S3 Connection via Proxy...");
    console.log("Endpoint:", process.env.NAS_ENDPOINT);

    const client = new S3Client({
        region: process.env.NAS_REGION || "us-east-1",
        endpoint: process.env.NAS_ENDPOINT,
        credentials: {
            accessKeyId: process.env.NAS_ACCESS_KEY,
            secretAccessKey: process.env.NAS_SECRET_KEY,
        },
        forcePathStyle: true,
    });

    try {
        const response = await client.send(new ListBucketsCommand({}));
        console.log("SUCCESS! Buckets:", response.Buckets.map(b => b.Name));
    } catch (error) {
        console.error("FAILED!");
        if (error.$response) {
            console.log("--- RAW RESPONSE START ---");
            // In SDK v3, $response might be tricky to read directly as string
            console.log("HTTP Status:", error.$metadata?.httpStatusCode);
        }
        console.error("Error Message:", error.message);
    }
}

testS3();
