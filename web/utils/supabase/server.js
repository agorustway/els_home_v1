import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('Cookies count:', allCookies.length)

    const client = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return allCookies
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                    }
                },
            },
        }
    )

    // 디버그 모드 시 auth.getUser() 모킹 (API 로그 기록 및 보안 우회용)
    if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
        const originalGetUser = client.auth.getUser.bind(client.auth);
        client.auth.getUser = async (token) => {
            const result = await originalGetUser(token);
            if (result.data.user) return result;
            return {
                data: {
                    user: {
                        id: 'debug-admin-id',
                        email: 'debug_admin@nollae.com', // 전용 디버그 관리자 계정
                        user_metadata: { name: '디버그관리자' },
                        role: 'authenticated'
                    }
                },
                error: null
            };
        };
        
        // getSession도 동일하게 모킹
        const originalGetSession = client.auth.getSession.bind(client.auth);
        client.auth.getSession = async () => {
            const result = await originalGetSession();
            if (result.data.session) return result;
            return {
                data: {
                    session: {
                        user: {
                            id: 'debug-admin-id',
                            email: 'debug_admin@nollae.com',
                            user_metadata: { name: '디버그관리자' }
                        }
                    }
                },
                error: null
            };
        };
    }

    return client;
}
export async function createAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}
