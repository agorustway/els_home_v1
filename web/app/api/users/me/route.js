import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

// Get Current User Info
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('*')
            .eq('id', user.id)
            .single();

        // Get Post Count
        const { count } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', user.id);

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: roleData?.name || '',
                phone: roleData?.phone || '',
                role: roleData?.role || 'visitor',
                requested_role: roleData?.requested_role, // Include requested role
                post_count: count || 0
            }
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Update Profile
export async function PATCH(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { name, phone, role } = await request.json(); // role here is the requested one
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        
        // Handle Role Request
        if (role !== undefined) {
            // Fetch current role first
            const { data: currentRoleData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('id', user.id)
                .single();
            
            // If trying to request admin, block it
            if (role === 'admin') {
                return NextResponse.json({ error: 'Cannot request admin role' }, { status: 403 });
            }

            // Instead of updating 'role' directly, update 'requested_role'
            // Unless the user is already an admin (admins can change their own role? maybe not needed)
            // Let's stick to the rule: Users can only REQUEST a change.
            updates.requested_role = role;
        }

        const adminSupabase = await createAdminClient(); // Use admin client to ensure write access to user_roles
        const { error } = await adminSupabase
            .from('user_roles')
            .update(updates)
            .eq('id', user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Withdraw (Self-Delete or Ban)
export async function DELETE() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const adminSupabase = await createAdminClient();

        // Check posts count
        const { count } = await adminSupabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', user.id);

        if (count > 0) {
            // Option 1: Ban user (Soft Delete)
            const { error: banError } = await adminSupabase.auth.admin.updateUserById(
                user.id,
                { ban_duration: '876000h' } // 100 years
            );
            if (banError) throw banError;
            return NextResponse.json({ success: true, mode: 'banned' });
        } else {
            // Option 2: Hard Delete
            // Delete dependent data first just in case
            await adminSupabase.from('user_roles').delete().eq('id', user.id);
            const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id);
            if (deleteError) throw deleteError;
            return NextResponse.json({ success: true, mode: 'deleted' });
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
