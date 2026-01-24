'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '../utils/supabase/client';

export function useUserProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // 1. Fetch from public.profiles using email (Primary identity)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', user.email)
        .single();

      // 2. Fetch from public.user_roles using email (Identity merging)
      // Note: We try ID first for strictness, then fallback to Email for merging
      let { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!roleData) {
        // Try merging by email if no ID-based role exists
        const { data: mergedRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('email', user.email)
          .single();
        roleData = mergedRole;
      }

      // Extract metadata fallback for avatars
      const meta = user.user_metadata || {};
      const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;

      setProfile({
        ...user,
        ...profileData,
        avatar_url: profileData?.avatar_url || metaAvatar || null,
        role: roleData?.role || 'visitor',
      });
    } else {
      setProfile(null);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Refetch profile on sign-in or sign-out
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchProfile();
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchProfile, supabase]);

  return { profile, loading };
}
