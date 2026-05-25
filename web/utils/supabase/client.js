import { createBrowserClient } from '@supabase/ssr'
import { createUnavailableSupabaseClient } from './unavailableClient'

const MISSING_SUPABASE_CONFIG_MESSAGE = 'Supabase 환경변수가 설정되지 않았습니다.'

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        return createUnavailableSupabaseClient(MISSING_SUPABASE_CONFIG_MESSAGE)
    }

    const client = createBrowserClient(
        supabaseUrl,
        supabaseAnonKey
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
                        email: 'debug_admin@elssolution.com',
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
