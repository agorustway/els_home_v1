import { createClient } from "webdav";

// Bypass SSL verification for WebDAV (Fixes self-signed cert issues)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log("Initializing WebDAV Client:", process.env.NAS_URL);

const client = createClient(
    process.env.NAS_URL,
    {
        username: process.env.NAS_USER,
        password: process.env.NAS_PW
    }
);

export function getNasClient() {
    return client;
}

export async function listFiles(path = "/") {
    try {
        const directoryItems = await client.getDirectoryContents(path);
        return directoryItems.map(item => ({
            name: item.basename,
            type: item.type === "directory" ? "directory" : "file",
            path: item.filename,
            size: item.size,
            lastMod: item.lastmod
        }));
    } catch (error) {
        console.error("WebDAV List Error:", error);
        throw new Error("NAS 연결 실패");
    }
}

export async function getFileReadStream(path) {
    return client.createReadStream(path);
}

export async function uploadFileStream(path, stream) {
    return client.createWriteStream(path).write(stream);
}

export async function createFolder(path) {
    if (await client.exists(path) === false) {
        await client.createDirectory(path);
    }
}

export async function deleteFile(path) {
    await client.deleteFile(path);
}

export async function moveFile(from, to) {
    await client.moveFile(from, to);
}

export async function copyFile(from, to) {
    await client.copyFile(from, to);
}
