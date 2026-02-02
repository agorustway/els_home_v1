import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// Get Current Unified User Info
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Use Admin Client to bypass RLS
        const adminSupabase = await createAdminClient();

        // Email 기반 단일 조회 (Simple & Clean)
        const { data: roleData } = await adminSupabase
            .from('user_roles')
            .select('*')
            .eq('email', user.email)
            .single();

        const { data: profileData } = await adminSupabase
            .from('profiles')
            .select('*')
            .eq('email', user.email)
            .single();

        // Get Post Count
        const { count } = await adminSupabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_email', user.email);

        // Extract avatar from metadata
        const meta = user.user_metadata || {};
        const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;

        // Combine data
        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: profileData?.full_name || roleData?.name || '',
                phone: profileData?.phone || roleData?.phone || '',
                avatar_url: profileData?.avatar_url || metaAvatar || null,
                role: roleData?.role || 'visitor',
                rank: profileData?.rank || roleData?.rank || '',
                position: profileData?.position || roleData?.position || '',
                requested_role: roleData?.requested_role,
                post_count: count || 0
            }
        });
    } catch (error) {
        console.error('GET /api/users/me Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Update Unified Profile
export async function PATCH(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { name, phone, role, rank, position } = await request.json();
        const adminSupabase = await createAdminClient();

        // 1. Update/Insert user_roles (Email 기반 UPSERT)
        const roleUpdates = {};
        if (name !== undefined) roleUpdates.name = name;
        if (phone !== undefined) roleUpdates.phone = phone;
        if (rank !== undefined) roleUpdates.rank = rank;
        if (position !== undefined) roleUpdates.position = position;
        // Do not directly update role here if there are specific role change rules.
        // Handle role change separately after fetching current role.

        if (Object.keys(roleUpdates).length > 0) {
            roleUpdates.email = user.email;
            roleUpdates.updated_at = new Date().toISOString();

            const { error: roleError } = await adminSupabase
                .from('user_roles')
                .upsert(roleUpdates, { onConflict: 'email', ignoreDuplicates: false }); // Ensure existing record is updated

            if (roleError) {
                console.error('Role Update Error:', roleError);
                return NextResponse.json({ error: roleError.message }, { status: 500 });
            }
        }

        // 2. Update/Insert profiles (Email 기반 UPSERT)
        const profileUpdates = {};
        if (name !== undefined) profileUpdates.full_name = name;
        if (phone !== undefined) profileUpdates.phone = phone;
        if (rank !== undefined) profileUpdates.rank = rank;
        if (position !== undefined) profileUpdates.position = position;

        const meta = user.user_metadata || {};
        const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;
        if (metaAvatar) profileUpdates.avatar_url = metaAvatar;

        if (Object.keys(profileUpdates).length > 0) {
            profileUpdates.email = user.email;
            profileUpdates.updated_at = new Date().toISOString();

            const { error: profileError } = await adminSupabase
                .from('profiles')
                .upsert(profileUpdates, { onConflict: 'email', ignoreDuplicates: false }); // Ensure existing record is updated

            if (profileError) {
                console.error('Profile Update Error:', profileError);
                return NextResponse.json({ error: profileError.message }, { status: 500 });
            }
        }

        // 3. Handle Role Change Request
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
                    // Update role
                    const { error: roleUpdateError } = await adminSupabase
                        .from('user_roles')
                        .update({ role: role, requested_role: null, updated_at: new Date().toISOString() })
                        .eq('email', user.email);

                    if (roleUpdateError) {
                        console.error('Role Change Update Error:', roleUpdateError);
                        return NextResponse.json({ error: roleUpdateError.message }, { status: 500 });
                    }
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('PATCH /api/users/me Error:', error);
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
            await adminSupabase.from('user_roles').delete().eq('email', user.email);
            const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id);
            if (deleteError) throw deleteError;
            return NextResponse.json({ success: true, mode: 'deleted' });
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
