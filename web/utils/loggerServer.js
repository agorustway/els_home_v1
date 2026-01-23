import { createClient } from './supabase/server';

/**
 * Server-side User Activity Logger
 */
export async function logActivityServer(actionType, path, metadata = {}) {
    const supabase = await createClient();

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('user_activity_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action_type: actionType,
            path: path,
            metadata: metadata
        });
    } catch (err) {
        console.error('Server logging failed:', err);
    }
}
