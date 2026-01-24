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
      // Fetch from public.profiles using email
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', user.email)
        .single();
      
      if (profileError) {
        console.error('Error fetching profile:', profileError.message);
      }

      // Fetch from public.user_roles using user.id
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (roleError) {
        // Not every user might have a role, so this might not be a critical error
        // console.warn('Error fetching user role:', roleError.message);
      }

      setProfile({
        ...user, // include all original auth.user properties
        ...profileData, // overwrite with public.profiles data (full_name, avatar_url)
        role: roleData?.role || 'visitor', // Add role from user_roles
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
