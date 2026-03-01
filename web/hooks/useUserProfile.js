'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '../utils/supabase/client';

export function useUserProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      try {
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const data = await res.json();
          setProfile(data.user);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
        setProfile(null);
      }
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
