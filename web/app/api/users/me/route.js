import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

// Get Current Unified User Info
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Get unified profile from public.profiles
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', user.email)
            .single();

        // 2. Get role data from user_roles
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, requested_role')
            .eq('id', user.id)
            .single();
        
        // 3. Get Post Count (remains based on auth.user.id for now)
        const { count } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', user.id);

        // 4. Combine data, prioritizing profiles table for name/phone
        return NextResponse.json({
            user: {
                id: user.id, // Keep auth.user.id for role-based lookups
                email: user.email,
                name: profileData?.full_name || '', // Use full_name from profiles
                phone: profileData?.phone || '', // Use phone from profiles
                avatar_url: profileData?.avatar_url, // Use avatar from profiles
                role: roleData?.role || 'visitor',
                requested_role: roleData?.requested_role,
                post_count: count || 0
            }
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Update Unified Profile
export async function PATCH(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { name, phone, role } = await request.json();
        const adminSupabase = await createAdminClient();

        // Update profiles table for name and phone
        if (name !== undefined || phone !== undefined) {
            const profileUpdates = {};
            if (name !== undefined) profileUpdates.full_name = name;
            if (phone !== undefined) profileUpdates.phone = phone;

            const { error: profileError } = await adminSupabase
                .from('profiles')
                .update(profileUpdates)
                .eq('email', user.email);
            
            if (profileError) throw profileError;
        }
        
        // Handle Role Change based on the new policy
        if (role !== undefined) {
            // Block any self-request for admin role
            if (role === 'admin') {
                return NextResponse.json({ error: '관리자 권한은 요청할 수 없습니다.' }, { status: 403 });
            }

            // Fetch current role first
            const { data: currentRoleData } = await adminSupabase
                .from('user_roles')
                .select('role')
                .eq('id', user.id)
                .single();

            const currentUserRole = currentRoleData?.role || 'visitor';

            // 'visitor' cannot change their role; they must be assigned one by an admin.
            if (currentUserRole === 'visitor') {
                return NextResponse.json({ error: '방문객은 소속 지점을 직접 변경할 수 없습니다. 관리자에게 문의하세요.' }, { status: 403 });
            } 
            // Any other authorized user (non-visitor) can change their role directly.
            else {
                const { error: roleError } = await adminSupabase
                    .from('user_roles')
                    .update({ 
                        role: role,
                        requested_role: null // Clear any pending requests
                    })
                    .eq('id', user.id);

                if (roleError) throw roleError;
            }
        }

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

        // Good housekeeping: delete from public.profiles first
        await adminSupabase.from('profiles').delete().eq('email', user.email);

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
            // Delete dependent data first
            await adminSupabase.from('user_roles').delete().eq('id', user.id);
            const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id);
            if (deleteError) throw deleteError;
            return NextResponse.json({ success: true, mode: 'deleted' });
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
