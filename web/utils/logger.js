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

    sessionPromise.then(({ data: { session } }) => {
        const user = session?.user;
        if (!user) return;

        supabaseClient.from('user_activity_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action_type: actionType,
            path: path || (typeof window !== 'undefined' ? window.location.pathname : path),
            metadata: {
                ...metadata,
                userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server',
            }
        }).then(({ error }) => {
            if (error) {
                // Ignore table not found errors quietly, complain otherwise
                if (error.code !== 'PGRST205' && error.code !== '42P01') {
                    console.error('[ActivityLogger] Logging failed:', error.message);
                }
            }
        }).catch((err) => {
            // Error connecting to DB for logs, ignore quietly
        });
    }).catch((err) => {
        if (typeof window !== 'undefined') cachedSessionPromise = null;
    });
}
