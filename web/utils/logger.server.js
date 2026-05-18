import { createAdminClient, createClient as createServerClient } from './supabase/server';

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

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
        const payload = {
            user_email: user?.email || 'anonymous',
            action_type: actionType,
            path: path,
            metadata: {
                ...metadata,
                userAgent: 'Server',
                user_id: user?.id
            }
        };
        const baseUrl = process.env.ELS_BACKEND_URL || process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';

        if (baseUrl) {
            await fetch(`${baseUrl}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return;
        }

        const adminSupabase = await createAdminClient();
        await adminSupabase.from('user_activity_logs').insert({
            user_id: isUuid(user?.id) ? user.id : null,
            user_email: payload.user_email,
            action_type: payload.action_type,
            path: payload.path,
            metadata: payload.metadata
        });
    } catch (err) {
        console.error('[ActivityLoggerServer] Failed to send log to NAS:', err);
    }
}
