import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();

        // Check if requester is admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch all users from auth.users using admin API
        const adminSupabase = await createAdminClient();
        const { data: { users: authUsers }, error: authError } = await adminSupabase.auth.admin.listUsers();

        if (authError) throw authError;

        // Fetch all role assignments
        const { data: userRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select('*');

        if (rolesError) throw rolesError;

        // Create a map of user roles for quick lookup
        const rolesMap = {};
        userRoles?.forEach(r => {
            rolesMap[r.id] = r;
        });

        // Merge auth users with their roles
        const mergedUsers = authUsers.map(authUser => ({
            id: authUser.id,
            email: authUser.email,
            role: rolesMap[authUser.id]?.role || 'visitor',
            created_at: rolesMap[authUser.id]?.created_at || authUser.created_at
        }));

        // Sort by creation date, newest first
        mergedUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return NextResponse.json({ users: mergedUsers });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const supabase = await createClient();
        const { userId, role, email } = await request.json();

        // Check if requester is admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Use admin client to bypass RLS and handle upsert
        const adminSupabase = await createAdminClient();
        const { error } = await adminSupabase
            .from('user_roles')
            .upsert({
                id: userId,
                email: email,
                role: role
            }, {
                onConflict: 'id'
            });

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
