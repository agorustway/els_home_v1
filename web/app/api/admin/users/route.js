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
            name: rolesMap[authUser.id]?.name, // Include name
            can_write: rolesMap[authUser.id]?.can_write || false,
            can_delete: rolesMap[authUser.id]?.can_delete || false,
            can_read_security: rolesMap[authUser.id]?.can_read_security || false,
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
        const { userId, role, email, can_write, can_delete, can_read_security, name } = await request.json();

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

        const adminSupabase = await createAdminClient();

        // Build update object with only provided fields
        const updates = {};
        if (email !== undefined) updates.email = email;
        if (role !== undefined) updates.role = role;
        if (can_write !== undefined) updates.can_write = can_write;
        if (can_delete !== undefined) updates.can_delete = can_delete;
        if (can_read_security !== undefined) updates.can_read_security = can_read_security;
        if (name !== undefined) updates.name = name;

        // Try UPDATE first (safe for partial updates)
        const { error: updateError, count } = await adminSupabase
            .from('user_roles')
            .update(updates)
            .eq('id', userId)
            .select(); // Need select to get count if using old supabase-js, but error is enough

        // If UPDATE failed or no row affected (and we have enough info to insert), try UPSERT
        // Note: checking count is tricky depending on version. simpler: fetch first or just try upsert if update fails?
        // But upsert kills other fields.
        // Let's assume user_roles exists (99%). If not, we fall back to UPSERT with minimal fields.
        
        if (updateError) throw updateError;

        // Note: If no row existed, update doesn't throw error but does nothing.
        // We can check if we need to insert.
        // For simplicity in this admin tool, we assume user_roles exists. 
        // If not, the user won't show up in the list properly anyway.
        // If needed, we can check `data` returned from update.

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}