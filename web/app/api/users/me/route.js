import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

// Get Current Unified User Info
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Get unified profile from public.profiles using EMAIL (Merges identities)
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', user.email)
            .single();

        // 2. Get role data from user_roles using EMAIL (Supports Cross-Provider Permissions)
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, requested_role')
            .eq('email', user.email)
            .single();

        // 3. Get Post Count (Sum posts by email for true consolidated view)
        const { count } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_email', user.email);

        // 4. Extract possible avatar from metadata if DB is empty
        const meta = user.user_metadata || {};
        const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;

        // 5. Combine data
        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: profileData?.full_name || '',
                phone: profileData?.phone || '',
                avatar_url: profileData?.avatar_url || metaAvatar || null,
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

        // 1. Update profiles table using EMAIL (Master Identity)
        const meta = user.user_metadata || {};
        const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;

        const profileUpdates = {
            updated_at: new Date().toISOString()
        };
        // Only update fields if they are provided/changed (to avoid overwriting with nulls if logic changes)
        // Client sends current values, so it's safer to just update what's passed.
        if (name !== undefined) profileUpdates.full_name = name;
        if (phone !== undefined) profileUpdates.phone = phone;
        if (metaAvatar) profileUpdates.avatar_url = metaAvatar; // Keep avatar synced

        // Use UPDATE instead of UPSERT to avoid Unique Constraint errors if email is often duplicated or not unique indexed properly
        const { error: profileError } = await adminSupabase
            .from('profiles')
            .update(profileUpdates)
            .eq('email', user.email);

        if (profileError) {
            console.error('Profile Update Error:', profileError);
            // Don't throw here, try updating user_roles as well
        }

        // 2. Redundant sync with user_roles (Admin page support)
        const roleBackupUpdates = {};
        if (name !== undefined) roleBackupUpdates.name = name;
        if (phone !== undefined) roleBackupUpdates.phone = phone;

        if (Object.keys(roleBackupUpdates).length > 0) {
            const { error: roleError } = await adminSupabase
                .from('user_roles')
                .update(roleBackupUpdates)
                .eq('email', user.email);

            if (roleError) console.error('Role Update Error:', roleError);
        }

        // 3. Handle Role Change (by Email)
        if (role !== undefined) {
            const { data: currentRoleData } = await adminSupabase
                .from('user_roles')
                .select('role')
                .eq('email', user.email)
                .single();

            const currentUserRole = currentRoleData?.role || 'visitor';

            if (role !== currentUserRole) {
                if (role === 'admin') {
                    return NextResponse.json({ error: '관리자 권한은 요청할 수 없습니다.' }, { status: 403 });
                }

                if (currentUserRole === 'visitor') {
                    return NextResponse.json({ error: '방문객은 소속 지점을 직접 변경할 수 없습니다. 관리자에게 문의하세요.' }, { status: 403 });
                }
                else {
                    await adminSupabase
                        .from('user_roles')
                        .upsert({ email: user.email, role: role, requested_role: null }, { onConflict: 'email' });
                }
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
