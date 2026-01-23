import { createClient } from './supabase/client';

/**
 * Logs user activity to Supabase
 * @param {string} actionType - 'PAGE_VIEW', 'CLICK', 'DOWNLOAD', etc.
 * @param {string} path - Current URL path or file path
 * @param {object} metadata - Additional info (button name, device info, etc.)
 */
export async function logActivity(actionType, path, metadata = {}) {
    const supabase = createClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return; // Don't log for unauthenticated users if needed

        const { error } = await supabase.from('user_activity_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action_type: actionType,
            path: path || window.location.pathname,
            metadata: {
                ...metadata,
                userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server',
            }
        });

        if (error) console.error('Logging failed:', error);
    } catch (err) {
        console.error('Error during activity logging:', err);
    }
}
