import { createClient } from './supabase/client';

/**
 * Logs user activity to Supabase
 * @param {string} actionType - 'PAGE_VIEW', 'CLICK', 'DOWNLOAD', etc.
 * @param {string} path - Current URL path or file path
 * @param {object} metadata - Additional info (button name, device info, etc.)
 */
export function logActivity(actionType, path, metadata = {}) {
    const supabase = createClient();

    // getSession()으로 빠르게 확인 후, 로그 삽입은 비동기(fire-and-forget) 처리해 페이지 전환을 막지 않음
    supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user;
        if (!user) return;

        supabase.from('user_activity_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action_type: actionType,
            path: path || (typeof window !== 'undefined' ? window.location.pathname : path),
            metadata: {
                ...metadata,
                userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server',
            }
        }).then(({ error }) => {
            if (error) console.error('Logging failed:', error);
        }).catch((err) => console.error('Error during activity logging:', err));
    }).catch((err) => console.error('Error getting session for activity log:', err));
}
