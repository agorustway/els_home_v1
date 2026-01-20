import { createClient } from "webdav";

// Singleton client instance
let client = null;

export function getNasClient() {
    if (!client) {
        if (!process.env.NAS_URL) {
            console.error('NAS_URL is not defined in environment variables');
        }
        console.log('Initializing NAS client with URL:', process.env.NAS_URL);
        client = createClient(process.env.NAS_URL, {
            username: process.env.NAS_USER,
            password: process.env.NAS_PW,
            timeout: 10000
        });
    }
    return client;
}
