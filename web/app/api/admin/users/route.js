import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

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
            .eq('id', user.id)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const adminSupabase = await createAdminClient();

        // 1. Fetch all users (Supabase ListUsers doesn't support advanced search well, so we fetch & filter/slice)
        // Note: For huge scale (10k+), this needs a better approach (e.g. sync auth to public table).
        // For now, fetching all is acceptable or we use pagination from listUsers.
        // But we need to filter by name (in user_roles) and email.

        const { data: { users: authUsers }, error: authError } = await adminSupabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000 // Fetch up to 1000 for client-side filtering (Simulated "Big" list)
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

        // Map by Email for identity merging
        const rolesMap = {};
        userRoles?.forEach(r => { if (r.email) rolesMap[r.email] = r; });

        const profilesMap = {};
        profiles?.forEach(p => { if (p.email) profilesMap[p.email] = p; });

        // 3. Fetch Post Counts aggregated by email
        const { data: postsData } = await adminSupabase
            .from('posts')
            .select('author_email');

        const postCounts = {};
        postsData?.forEach(p => {
            if (p.author_email) {
                postCounts[p.author_email] = (postCounts[p.author_email] || 0) + 1;
            }
        });

        // 4. Unique User Consolidation (Merge by Email)
        const uniqueEmails = new Set();
        let consolidatedUsers = [];

        authUsers.forEach(authUser => {
            if (!authUser.email || uniqueEmails.has(authUser.email)) return;
            uniqueEmails.add(authUser.email);

            const email = authUser.email;
            const roleInfo = rolesMap[email] || {};
            const profileInfo = profilesMap[email] || {};

            consolidatedUsers.push({
                id: authUser.id, // Primary ID for this session
                email: email,
                role: roleInfo.role || 'visitor',
                name: profileInfo.full_name || roleInfo.name || '',
                phone: profileInfo.phone || roleInfo.phone || '',
                avatar_url: profileInfo.avatar_url,
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

// Helper for Role Label (Server Side if needed, but usually client side)
function getRoleLabel(role) {
    const labels = { admin: '관리자', headquarters: '서울본사', asan: '아산지점', jungbu: '중부지점', dangjin: '당진지점', yesan: '예산지점', seosan: '서산지점', yeoncheon: '연천지점', ulsan: '울산지점', imgo: '임고지점', bulk: '벌크사업부', visitor: '방문자' };
    return labels[role] || role;
}

export async function PATCH(request) {
    try {
        const supabase = await createClient();
        const { userId, role, email, can_write, can_delete, can_read_security, name, phone, banned } = await request.json();

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

        // Handle Ban/Unban logic (Auth level is still ID based)
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
            // 1. Sync Role & Permissions in user_roles
            const roleUpdates = { email: email };
            if (role !== undefined) roleUpdates.role = role;
            if (can_write !== undefined) roleUpdates.can_write = can_write;
            if (can_delete !== undefined) roleUpdates.can_delete = can_delete;
            if (can_read_security !== undefined) roleUpdates.can_read_security = can_read_security;
            if (name !== undefined) roleUpdates.name = name;
            if (phone !== undefined) roleUpdates.phone = phone;

            await adminSupabase
                .from('user_roles')
                .upsert(roleUpdates, { onConflict: 'email' });

            // 2. Sync Profile data
            if (name !== undefined || phone !== undefined) {
                const profileUpdates = { email: email };
                if (name !== undefined) profileUpdates.full_name = name;
                if (phone !== undefined) profileUpdates.phone = phone;

                await adminSupabase
                    .from('profiles')
                    .upsert(profileUpdates, { onConflict: 'email' });
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
            .eq('id', user.id)
            .single();

        if (roleData?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const adminSupabase = await createAdminClient();

        // 1. Delete dependent data first
        await adminSupabase.from('user_roles').delete().eq('id', userId);
        await adminSupabase.from('posts').delete().eq('author_id', userId);

        // Removed storage.objects direct deletion as it caused schema() error.
        // Orphaned files can be cleaned up later via storage policies or cron.

        // 2. Delete user from auth.users
        const { error } = await adminSupabase.auth.admin.deleteUser(userId);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}