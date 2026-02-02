import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '30');
        const query = searchParams.get('q') || '';
        const showBanned = searchParams.get('showBanned') === 'true';

        const supabase = await createClient();

        // Check if requester is admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const adminSupabase = await createAdminClient();

        // 1. Fetch all users
        const { data: { users: authUsers }, error: authError } = await adminSupabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000 // Fetch up to 1000 for client-side filtering 
        });

        if (authError) throw authError;

        // 2. Fetch user details (roles, name, phone)
        const { data: userRoles } = await adminSupabase
            .from('user_roles')
            .select('*');

        // 2.1 Fetch profiles (primary info)
        const { data: profiles } = await adminSupabase
            .from('profiles')
            .select('*');

        // Map by Email
        const rolesMap = {};
        userRoles?.forEach(r => { if (r.email) rolesMap[r.email] = r; });

        const profilesMap = {};
        profiles?.forEach(p => { if (p.email) profilesMap[p.email] = p; });

        // 3. Fetch Post Counts
        const { data: postsData } = await adminSupabase
            .from('posts')
            .select('author_email');

        const postCounts = {};
        postsData?.forEach(p => {
            if (p.author_email) {
                postCounts[p.author_email] = (postCounts[p.author_email] || 0) + 1;
            }
        });

        // 4. Unique User Consolidation
        const uniqueEmails = new Set();
        let consolidatedUsers = [];

        authUsers.forEach(authUser => {
            if (!authUser.email || uniqueEmails.has(authUser.email)) return;
            uniqueEmails.add(authUser.email);

            const email = authUser.email;
            const roleInfo = rolesMap[email] || {};
            const profileInfo = profilesMap[email] || {};

            consolidatedUsers.push({
                id: authUser.id, // Primary ID
                email: email,
                role: roleInfo.role || 'visitor',
                name: profileInfo.full_name || roleInfo.name || '',
                phone: profileInfo.phone || roleInfo.phone || '',
                avatar_url: profileInfo.avatar_url,
                rank: profileInfo.rank || roleInfo.rank || '',
                position: profileInfo.position || roleInfo.position || '',
                can_write: roleInfo.can_write || false,
                can_delete: roleInfo.can_delete || false,
                can_read_security: roleInfo.can_read_security || false,
                is_banned: authUser.banned_until && new Date(authUser.banned_until) > new Date(),
                requested_role: roleInfo.requested_role,
                post_count: postCounts[email] || 0,
                created_at: roleInfo.created_at || authUser.created_at
            });
        });

        // Filter: Banned
        if (!showBanned) {
            consolidatedUsers = consolidatedUsers.filter(u => !u.is_banned);
        }

        // Filter: Search
        if (query) {
            const lowerQ = query.toLowerCase();
            consolidatedUsers = consolidatedUsers.filter(u =>
                u.email?.toLowerCase().includes(lowerQ) ||
                u.name?.toLowerCase().includes(lowerQ) ||
                getRoleLabel(u.role).toLowerCase().includes(lowerQ)
            );
        }

        // Sort
        consolidatedUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Pagination
        const total = consolidatedUsers.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const paginatedUsers = consolidatedUsers.slice(startIndex, startIndex + limit);

        return NextResponse.json({
            users: paginatedUsers,
            pagination: { page, limit, total, totalPages }
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function getRoleLabel(role) {
    const labels = { admin: '관리자', headquarters: '서울본사', asan: '아산지점', jungbu: '중부지점', dangjin: '당진지점', yesan: '예산지점', seosan: '서산지점', yeoncheon: '연천지점', ulsan: '울산지점', imgo: '임고지점', bulk: '벌크사업부', visitor: '방문자' };
    return labels[role] || role;
}

export async function PATCH(request) {
    try {
        const supabase = await createClient();
        const { userId, role, email, can_write, can_delete, can_read_security, name, phone, rank, position, banned } = await request.json();

        // Check if requester is admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const adminSupabase = await createAdminClient();

        // Handle Ban/Unban logic
        if (banned !== undefined) {
            const banDuration = banned ? '876000h' : 'none';
            const { error: banError } = await adminSupabase.auth.admin.updateUserById(
                userId,
                { ban_duration: banDuration }
            );
            if (banError) throw banError;
        }

        // Handle Identity Updates (Email-centric)
        if (email) {
            const targetEmail = email.trim(); // Ensure no whitespace

            // 1. Sync Role & Permissions in user_roles
            const roleUpdates = {};
            if (role !== undefined) roleUpdates.role = role;
            if (can_write !== undefined) roleUpdates.can_write = can_write;
            if (can_delete !== undefined) roleUpdates.can_delete = can_delete;
            if (can_read_security !== undefined) roleUpdates.can_read_security = can_read_security;
            if (name !== undefined) roleUpdates.name = name;
            if (phone !== undefined) roleUpdates.phone = phone;

            if (Object.keys(roleUpdates).length > 0) {
                // Try UPDATE first
                const { error: roleError, count: rCount } = await adminSupabase
                    .from('user_roles')
                    .update(roleUpdates)
                    .eq('email', targetEmail) // Use trimmed email
                    .select('*', { count: 'exact' }); // Select all to be safe

                if (roleError) {
                    console.error('Admin Role Update Error:', roleError);
                    throw roleError; // Explicitly throw to see error in response
                }

                // If no record, Insert
                if (!rCount || rCount === 0) {
                    const newRoleData = {
                        email: targetEmail, // Use trimmed email
                        role: role || 'visitor',
                        name: name || '',
                        phone: phone || '',
                        can_write: can_write || false,
                        can_delete: can_delete || false,
                        can_read_security: can_read_security || false
                    };
                    if (userId) newRoleData.id = userId;

                    await adminSupabase.from('user_roles').insert(newRoleData);
                }
            }

            // 2. Sync Profile data
            const profileUpdates = {
                updated_at: new Date().toISOString()
            };
            if (name !== undefined) profileUpdates.full_name = name;
            if (phone !== undefined) profileUpdates.phone = phone;
            if (rank !== undefined) profileUpdates.rank = rank;
            if (position !== undefined) profileUpdates.position = position;

            if (Object.keys(profileUpdates).length > 1) {
                // Try UPDATE first
                const { error: profileError, count: pCount } = await adminSupabase
                    .from('profiles')
                    .update(profileUpdates)
                    .eq('email', targetEmail)
                    .select('*', { count: 'exact' });

                if (profileError) {
                    console.error('Admin Profile Update Error:', profileError);
                    throw profileError;
                }

                // If no record, Insert
                if (!pCount || pCount === 0) {
                    const newProfileData = {
                        email: targetEmail,
                        full_name: name || '',
                        phone: phone || '',
                        rank: rank || '',
                        position: position || ''
                    };
                    if (userId) newProfileData.id = userId;

                    await adminSupabase.from('profiles').insert(newProfileData);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('PATCH Error:', error);
        return NextResponse.json({
            error: error.message || 'Unknown error',
            details: error.details || error.toString()
        }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const supabase = await createClient();
        const { userId } = await request.json();

        // Check if requester is admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const adminSupabase = await createAdminClient();

        // 1. Delete dependent data first
        // Get email first if we have userId
        const { data: targetUser } = await adminSupabase.auth.admin.getUserById(userId);
        if (targetUser?.user?.email) {
            await adminSupabase.from('user_roles').delete().eq('email', targetUser.user.email);
        } else {
            // Fallback to ID deletion if email not found (legacy)
            await adminSupabase.from('user_roles').delete().eq('id', userId);
        }

        await adminSupabase.from('posts').delete().eq('author_id', userId);

        // 2. Delete user from auth.users
        const { error } = await adminSupabase.auth.admin.deleteUser(userId);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}