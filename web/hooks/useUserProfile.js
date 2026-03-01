'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '../utils/supabase/client';

export function useUserProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    // getSession(): 로컬/쿠키 기반으로 빠르게 조회 (페이지 이동 시 지연 감소)
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (user) {
      // profiles + user_roles 병렬 조회로 호출 횟수·대기 시간 축소
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('email', user.email).single(),
        supabase.from('user_roles').select('*').eq('email', user.email).single(),
      ]);

      const profileData = profileRes.data;
      const roleData = roleRes.data;
      const meta = user.user_metadata || {};
      const metaAvatar = meta.avatar_url || meta.picture || meta.profile_image || meta.kakao_account?.profile?.profile_image_url;

      setProfile({
        ...user,
        ...profileData,
        avatar_url: profileData?.avatar_url || metaAvatar || null,
        role: roleData?.role || 'visitor',
        rank: profileData?.rank || roleData?.rank || '',
        position: profileData?.position || roleData?.position || '',
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
