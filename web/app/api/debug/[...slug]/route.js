import { proxyToBackend } from '../../els/proxyToBackend';

export async function POST(req) {
    return proxyToBackend(req);
}

export async function GET(req) {
    return proxyToBackend(req);
}
