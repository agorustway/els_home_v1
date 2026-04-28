import { proxyToBackend } from '../proxyToBackend';

export async function GET(req, { params }) {
    if (process.env.ELS_BACKEND_URL) return proxyToBackend(req);
    return new Response(JSON.stringify({ error: 'Backend URL not configured' }), { status: 500 });
}

export async function POST(req, { params }) {
    if (process.env.ELS_BACKEND_URL) return proxyToBackend(req);
    return new Response(JSON.stringify({ error: 'Backend URL not configured' }), { status: 500 });
}

export async function DELETE(req, { params }) {
    if (process.env.ELS_BACKEND_URL) return proxyToBackend(req);
    return new Response(JSON.stringify({ error: 'Backend URL not configured' }), { status: 500 });
}
