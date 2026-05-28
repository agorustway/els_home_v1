import { createAdminClient, createClient } from '@/utils/supabase/server';

export async function getAuthenticatedAdminClient() {
    const sessionSupabase = await createClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();

    if (!user) {
        return { user: null, adminSupabase: null, sessionSupabase };
    }

    const adminSupabase = await createAdminClient();
    return { user, adminSupabase, sessionSupabase };
}
