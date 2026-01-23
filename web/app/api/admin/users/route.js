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
        const { data: userRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select('*');

        if (rolesError) throw rolesError;

        const rolesMap = {};
        userRoles?.forEach(r => {
            rolesMap[r.id] = r;
        });

        // 3. Fetch Post Counts for all users (to decide Delete vs Ban)
        // Optimization: Use .select('author_id', { count: 'exact', head: true }) is hard per user.
        // Better: Get all author_ids from posts and count them.
        const { data: postsData } = await adminSupabase
            .from('posts')
            .select('author_id');

        const postCounts = {};
        postsData?.forEach(p => {
            postCounts[p.author_id] = (postCounts[p.author_id] || 0) + 1;
        });

        // 4. Merge & Filter
        let mergedUsers = authUsers.map(authUser => ({
            id: authUser.id,
            email: authUser.email,
            role: rolesMap[authUser.id]?.role || 'visitor',
            name: rolesMap[authUser.id]?.name || '',
            phone: rolesMap[authUser.id]?.phone || '', // Added Phone
            can_write: rolesMap[authUser.id]?.can_write || false,
            can_delete: rolesMap[authUser.id]?.can_delete || false,
            can_read_security: rolesMap[authUser.id]?.can_read_security || false,
            is_banned: authUser.banned_until && new Date(authUser.banned_until) > new Date(),
            requested_role: rolesMap[authUser.id]?.requested_role, // Show requested role to admin
            post_count: postCounts[authUser.id] || 0, // Post Count
            created_at: rolesMap[authUser.id]?.created_at || authUser.created_at
        }));

        // Filter: Banned
        if (!showBanned) {
            mergedUsers = mergedUsers.filter(u => !u.is_banned);
        }

        // Filter: Search (Email or Name or Role)
        if (query) {
            const lowerQ = query.toLowerCase();
            mergedUsers = mergedUsers.filter(u =>
                u.email?.toLowerCase().includes(lowerQ) ||
                u.name?.toLowerCase().includes(lowerQ) ||
                getRoleLabel(u.role).toLowerCase().includes(lowerQ)
            );
        }

        // Sort
        mergedUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Pagination
        const total = mergedUsers.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const paginatedUsers = mergedUsers.slice(startIndex, startIndex + limit);

        return NextResponse.json({
            users: paginatedUsers,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
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

        // Handle Ban/Unban logic
        if (banned !== undefined) {
            const banDuration = banned ? '876000h' : 'none'; // 100 years or none
            const { error: banError } = await adminSupabase.auth.admin.updateUserById(
                userId,
                { ban_duration: banDuration }
            );
            if (banError) throw banError;
        }

        // Build update object for user_roles
        const updates = { id: userId };
        if (role !== undefined) {
            updates.role = role;
            updates.requested_role = null; // Clear request on role change
        }
        if (can_write !== undefined) updates.can_write = can_write;
        if (can_delete !== undefined) updates.can_delete = can_delete;
        if (can_read_security !== undefined) updates.can_read_security = can_read_security;
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;

        // Only update if there are fields to update (besides id)
        if (Object.keys(updates).length > 1) {
            const { error: updateError } = await adminSupabase
                .from('user_roles')
                .upsert(updates, { onConflict: 'id' });

            if (updateError) throw updateError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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