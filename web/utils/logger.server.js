import { createClient as createServerClient } from './supabase/server';

/**
 * Server-side User Activity Logger (Async)
 * @param {string} actionType - 'PAGE_VIEW', 'CLICK', 'DOWNLOAD', etc.
 * @param {string} path - Current URL path or file path
 * @param {object} metadata - Additional info (button name, device info, etc.)
 */
export async function logActivityServer(actionType, path, metadata = {}) {
    try {
        const supabase = await createServerClient();
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
