import { createClient } from './supabase/client';

let supabaseClient = null;
let cachedSessionPromise = null;

/**
 * Logs user activity to Supabase
 * @param {string} actionType - 'PAGE_VIEW', 'CLICK', 'DOWNLOAD', etc.
 * @param {string} path - Current URL path or file path
 * @param {object} metadata - Additional info (button name, device info, etc.)
 */
export function logActivity(actionType, path, metadata = {}) {
    if (typeof window !== 'undefined' && !supabaseClient) {
        supabaseClient = createClient();
    } else if (typeof window === 'undefined') {
        // 서버사이드일때는 매크번 새로 생성
        supabaseClient = createClient();
    }

    // 서버 사이드거나 브라우저 캐시가 없을때
    let sessionPromise = cachedSessionPromise;
    if (!sessionPromise || typeof window === 'undefined') {
        sessionPromise = supabaseClient.auth.getSession();
        if (typeof window !== 'undefined') cachedSessionPromise = sessionPromise;
    }

    sessionPromise.then(async ({ data: { session } }) => {
        const user = session?.user;
        const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
        
        try {
            await fetch(`${baseUrl}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: user?.email || 'anonymous',
                    action_type: actionType,
                    path: path || (typeof window !== 'undefined' ? window.location.pathname : path),
                    metadata: {
                        ...metadata,
                        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server',
                        user_id: user?.id
                    }
                })
            });
        } catch (err) {
            // 로그 저장 실패는 조용히 무시 (사용자 환경 보호)
            console.error('[ActivityLogger] Failed to send log to NAS:', err);
        }
    }).catch((err) => {
        if (typeof window !== 'undefined') cachedSessionPromise = null;
    });
}
/**
 * Server-side User Activity Logger (Async)
 * @param {string} actionType - 'PAGE_VIEW', 'CLICK', 'DOWNLOAD', etc.
 * @param {string} path - Current URL path or file path
 * @param {object} metadata - Additional info (button name, device info, etc.)
 */
export async function logActivityServer(actionType, path, metadata = {}) {
    const { createClient: createServerClient } = await import('./supabase/server');
    const supabase = await createServerClient();
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
        
        await fetch(`${baseUrl}/api/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: user?.email || 'anonymous',
                action_type: actionType,
                path: path,
                metadata: {
                    ...metadata,
                    userAgent: 'Server',
                    user_id: user?.id
                }
            })
        });
    } catch (err) {
        console.error('[ActivityLoggerServer] Failed to send log to NAS:', err);
    }
}
