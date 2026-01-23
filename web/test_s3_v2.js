const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
require('dotenv').config({ path: '.env.local' });

async function testVariation(name, config) {
    console.log(`\n--- Testing: ${name} ---`);
    console.log(`Endpoint: ${config.endpoint}`);
    const client = new S3Client({
        ...config,
        forcePathStyle: true,
        credentials: {
            accessKeyId: process.env.NAS_ACCESS_KEY,
            secretAccessKey: process.env.NAS_SECRET_KEY,
        },
    });

    try {
        const response = await client.send(new ListBucketsCommand({}));
        console.log("SUCCESS!", response.Buckets.map(b => b.Name));
        return true;
    } catch (error) {
        console.log(`FAILED: ${error.name} - ${error.message}`);
        if (error.$metadata) console.log(`HTTP Status: ${error.$metadata.httpStatusCode}`);
        return false;
    }
}

async function main() {
    // Current .env.local endpoint
    await testVariation("Standard HTTPS", {
        endpoint: "https://elssolution.synology.me",
        region: "us-east-1"
    });

    // Try with explicit port 443
    await testVariation("HTTPS Port 443", {
        endpoint: "https://elssolution.synology.me:443",
        region: "us-east-1"
    });

    // Try without path style (unlikely for MinIO)
    console.log("\n--- Testing: Without Path Style ---");
    const clientNoPath = new S3Client({
        endpoint: "https://elssolution.synology.me",
        region: "us-east-1",
        forcePathStyle: false,
        credentials: {
            accessKeyId: process.env.NAS_ACCESS_KEY,
            secretAccessKey: process.env.NAS_SECRET_KEY,
        },
    });
    try {
        await clientNoPath.send(new ListBucketsCommand({}));
        console.log("SUCCESS!");
    } catch (e) {
        console.log(`FAILED: ${e.message}`);
    }
}

main();
