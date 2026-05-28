'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  age: number | null;
  parent_approved: boolean;
  parent_email: string | null;
  banned: boolean;
  ban_reason: string | null;
  admin_alert: string | null;
  role: 'user' | 'admin';
  avatar_url: string | null;
  bio: string | null;
  status: string | null;
  can_create_bots: boolean;
  theme_pref: string | null;
  language_pref: string | null;
  message_density: 'compact' | 'comfortable';
  font_size_pref: 'small' | 'medium' | 'large';
  notification_sounds: boolean;
  accessibility_prefs: any;
  sound_settings: any;
  privacy_options: any;
  account_preferences: any;
  default_chat_behavior: any;
  ban_expires_at: string | null;
  is_warning: boolean;
  last_seen_version: string;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getSupabase = () => {
  try {
    return createClient();
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const updateStatus = useCallback(async (newStatus: string) => {
    const supabase = getSupabase();
    if (!supabase || !user) return;
    await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id);
  }, [user]);

  const fetchProfile = async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
    }
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        fetchProfile(initialSession.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        fetchProfile(currentSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Automatic Presence Logic
  useEffect(() => {
    if (!user) return;

    let idleTimer: NodeJS.Timeout;
    const setOnline = () => {
      clearTimeout(idleTimer);
      updateStatus('online');
      idleTimer = setTimeout(() => updateStatus('away'), 300000); // Away after 5 mins
    };

    window.addEventListener('mousemove', setOnline);
    window.addEventListener('keydown', setOnline);
    window.addEventListener('click', setOnline);
    
    setOnline();

    return () => {
      window.removeEventListener('mousemove', setOnline);
      window.removeEventListener('keydown', setOnline);
      window.removeEventListener('click', setOnline);
      clearTimeout(idleTimer);
    };
  }, [user, updateStatus]);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) {
      await updateStatus('offline');
      await supabase.auth.signOut();
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
