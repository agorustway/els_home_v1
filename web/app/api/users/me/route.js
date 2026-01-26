import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// Get Current Unified User Info
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Use Admin Client to bypass RLS (Important for merging identities by email)
        const adminSupabase = await createAdminClient();

        // 1. Get unified profile from public.profiles using EMAIL
        const { data: profileData } = await adminSupabase
            .from('profiles')
            .select('*')
            .eq('email', user.email)
            .single();

        // 2. Get role data from user_roles (Check BOTH ID and Email to find highest privilege)
        const { data: roleById } = await adminSupabase
            .from('user_roles')
            .select('role, requested_role')
            .eq('id', user.id)
            .single();

        const { data: roleByEmail } = await adminSupabase
            .from('user_roles')
            .select('role, requested_role')
            .eq('email', user.email)
            .single();

        // Merge Roles: Admin > Branch > Visitor
        let finalRoleData = { role: 'visitor', requested_role: null };

        const r1 = roleById?.role;
        const r2 = roleByEmail?.role;

        if (r1 === 'admin' || r2 === 'admin') {
            finalRoleData.role = 'admin';
        } else if (r1 && r1 !== 'visitor') {
            finalRoleData = roleById;
        } else if (r2 && r2 !== 'visitor') {
            finalRoleData = roleByEmail;
        } else {
            // Both are visitor or null, prefer ID data if exists
            finalRoleData = roleById || roleByEmail || finalRoleData;
        }

        // 3. Get Post Count
        const { count } = await adminSupabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_email', user.email);

        // 4. Extract possible avatar from metadata
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
                role: finalRoleData.role || 'visitor',
                requested_role: finalRoleData.requested_role,
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

        // 1. PROFILES Table Update (Update -> Insert fallback)
        const meta = user.user_metadata || {};
        const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;

        const profileData = {
            updated_at: new Date().toISOString()
        };
        if (name !== undefined) profileData.full_name = name;
        if (phone !== undefined) profileData.phone = phone;
        if (metaAvatar) profileData.avatar_url = metaAvatar;

        // Try UPDATE first
        const { count: pCount } = await adminSupabase
            .from('profiles')
            .update(profileData)
            .eq('email', user.email)
            .select('id', { count: 'exact' });

        if (!pCount) {
            // If no record, Insert
            await adminSupabase.from('profiles').insert({
                id: user.id,
                email: user.email,
                full_name: name || '',
                phone: phone || '',
                avatar_url: metaAvatar
            });
        }

        // 2. USER_ROLES Table Update (Update -> Insert fallback)
        const roleData = {};
        if (name !== undefined) roleData.name = name;
        if (phone !== undefined) roleData.phone = phone;

        if (Object.keys(roleData).length > 0) {
            const { count: rCount } = await adminSupabase
                .from('user_roles')
                .update(roleData)
                .eq('email', user.email)
                .select('id', { count: 'exact' });

            if (!rCount) {
                // If no record, Insert
                await adminSupabase.from('user_roles').insert({
                    id: user.id,
                    email: user.email,
                    role: 'visitor', // Default role
                    name: name || '',
                    phone: phone || ''
                });
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
                    const { count: roleUpdateCount } = await adminSupabase
                        .from('user_roles')
                        .update({ role: role, requested_role: null })
                        .eq('email', user.email)
                        .select('id', { count: 'exact' });

                    if (!roleUpdateCount) {
                        // Insert if missing (Unlikely if step 2 ran, but safe)
                        await adminSupabase.from('user_roles').insert({
                            id: user.id,
                            email: user.email,
                            role: role,
                            name: name || '',
                            phone: phone || ''
                        });
                    }
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
