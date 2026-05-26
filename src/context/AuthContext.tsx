'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createClient, hasSupabaseConfig } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

type Profile = {
  id: string;
  username: string;
  display_name: string;
  age: number | null;
  parent_email: string | null;
  parent_approved: boolean;
  banned: boolean | null;
  ban_reason: string | null;
  admin_alert: string | null;
  role: 'user' | 'admin';
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const getSupabase = useCallback(() => {
    if (!hasSupabaseConfig()) return null;
    supabaseRef.current ??= createClient();
    return supabaseRef.current;
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error) setProfile(data);
  }, [getSupabase]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // Missing deployment config is only known once the browser bundle runs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile, getSupabase]);

  const refreshProfile = async () => {
    if (user?.id) await fetchProfile(user.id);
  };

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
