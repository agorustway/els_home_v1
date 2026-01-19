'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '../utils/supabase/client';

export function useUserRole() {
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);

    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        async function fetchRole() {
            try {
                console.log('useUserRole: Fetching user...');
                const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();

                if (userError || !authUser) {
                    console.log('useUserRole: No user found');
                    setRole('visitor');
                    setLoading(false);
                    return;
                }

                setUser(authUser);
                console.log('useUserRole: User found, fetching role...', authUser.id);

                const { data: roleData, error: roleError } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('id', authUser.id)
                    .single();

                if (roleError && roleError.code !== 'PGRST116') {
                    console.error('Error fetching role:', roleError);
                }

                setRole(roleData?.role || 'visitor');
            } catch (error) {
                console.error('Unexpected error in useUserRole:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchRole();
    }, [supabase]);

    return { role, loading, user };
}
