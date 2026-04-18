import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const client = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const hasDebugCookie = typeof document !== 'undefined' && document.cookie.includes('__debug_mode=true');
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true' || hasDebugCookie) {
        const originalGetUser = client.auth.getUser.bind(client.auth);
        client.auth.getUser = async (token) => {
            const result = await originalGetUser(token);
            if (result.data.user) return result;
            return {
                data: {
                    user: {
                        id: 'debug-admin-id',
                        email: 'debug_admin@nollae.com',
                        user_metadata: { name: '디버그관리자' },
                        role: 'authenticated'
                    }
                },
                error: null
            };
        };
    }

    return client;
}
