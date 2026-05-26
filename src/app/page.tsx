'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import ChatRoom from '@/components/ChatRoom';
import AdminDashboard from '@/components/AdminDashboard';
import Login from '@/components/Login';
import AgeVerification from '@/components/AgeVerification';
import ChatDirectory from '@/components/ChatDirectory';
import AppProviders from '@/components/AppProviders';
import { createClient } from '@/lib/supabase';
import { Compass, MessageSquare, Plus, Users } from 'lucide-react';

type HubView = 'home' | 'dms' | 'groups' | 'discover' | 'settings' | 'admin' | 'chat';

function readHashRoute(): { view: HubView; chatId: string | null } {
  if (typeof window === 'undefined') return { view: 'home', chatId: null };

  const rawHash = window.location.hash.replace(/^#/, '');
  if (!rawHash) return { view: 'home', chatId: null };

  if (rawHash.startsWith('chat=')) {
    const params = new URLSearchParams(rawHash);
    return { view: 'chat', chatId: params.get('chat') };
  }

  if (['home', 'dms', 'groups', 'discover', 'settings', 'admin'].includes(rawHash)) {
    return { view: rawHash as HubView, chatId: null };
  }

  return { view: 'home', chatId: null };
}

type Recommendation = {
  id: string;
  name: string | null;
  last_activity_at: string | null;
  is_group?: boolean;
  is_discoverable?: boolean;
};

function HomeDashboard({
  onNavigate,
  onSelectChat,
}: {
  onNavigate: (view: Exclude<HubView, 'chat'>) => void;
  onSelectChat: (id: string) => void;
}) {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recentChats, setRecentChats] = useState<Recommendation[]>([]);

  useEffect(() => {
    const loadHomeData = async () => {
      const [{ data: memberships }, { data: chats }] = await Promise.all([
        supabase.rpc('get_my_chat_ids'),
        supabase
          .from('chats')
          .select('id, name, is_group, is_discoverable, last_activity_at')
          .order('last_activity_at', { ascending: false })
          .limit(20),
      ]);

      const joined = new Set(((memberships ?? []) as { chat_id: string }[]).map((item) => item.chat_id));
      const rows = (chats ?? []) as Recommendation[];
      setRecentChats(rows.filter((chat) => joined.has(chat.id)).slice(0, 5));
      setRecommendations(joined.size < 2 ? [] : rows.filter((chat) => chat.is_discoverable && !joined.has(chat.id)).slice(0, 3));
    };

    loadHomeData();
  }, [supabase]);

  return (
    <div className="app-panel flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-primary">
              Welcome back, {profile?.display_name || profile?.username}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Manage groups, start DMs, and find public rooms from one workspace.
            </p>
          </div>
          <button type="button" onClick={() => onNavigate('groups')} className="ui-button primary px-4 py-3">
            <Plus className="h-4 w-4" />
            Create group
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <QuickAction icon={MessageSquare} label="Start a DM" onClick={() => onNavigate('dms')} />
          <QuickAction icon={Users} label="Your groups" onClick={() => onNavigate('groups')} />
          <QuickAction icon={Compass} label="Discover public chats" onClick={() => onNavigate('discover')} />
        </div>

        <section className="surface-card mt-8 p-6">
          <h3 className="text-xl font-bold text-primary">Recent chats</h3>
          <div className="mt-5 grid gap-3">
            {recentChats.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-muted">
                No recent chats yet. Start a DM or join a public room.
              </div>
            ) : (
              recentChats.map((chat) => (
                <button key={chat.id} type="button" onClick={() => onSelectChat(chat.id)} className="rounded-xl bg-[var(--surface-elevated)] p-4 text-left transition hover:bg-[var(--surface-subtle)]">
                  <p className="font-bold text-primary">{chat.name || 'Untitled chat'}</p>
                  <p className="mt-1 text-xs text-muted">{chat.is_discoverable ? 'Public room' : chat.is_group ? 'Group' : 'Direct message'}</p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="surface-card mt-8 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-primary">Recommended public chats</h3>
              <p className="mt-1 text-sm text-muted">Based on your chat activity when there is enough history.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-muted">
                No recommendations yet because you have not explored much.
              </div>
            ) : (
              recommendations.map((chat) => (
                <button key={chat.id} type="button" onClick={() => onSelectChat(chat.id)} className="rounded-xl bg-[var(--surface-elevated)] p-4 text-left transition hover:bg-[var(--surface-subtle)]">
                  <p className="font-bold text-primary">{chat.name || 'Untitled public chat'}</p>
                  <p className="mt-1 text-xs text-muted">Public room</p>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="surface-card flex items-center gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-rainbow-blue">
        <Icon className="h-5 w-5" />
      </span>
      <span className="font-bold text-primary">{label}</span>
    </button>
  );
}

function HomeContent() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [currentView, setCurrentView] = useState<HubView>('home');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  useEffect(() => {
    // Hydration guard for auth state that only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    const applyHashRoute = () => {
      const route = readHashRoute();
      setCurrentView(route.view);
      setCurrentChatId(route.chatId);
    };

    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Login />;

  const navigate = (view: Exclude<HubView, 'chat'>) => {
    setCurrentChatId(null);
    setCurrentView(view);
    window.history.pushState(null, '', view === 'home' ? window.location.pathname : `#${view}`);
  };

  const openChat = (id: string) => {
    setCurrentChatId(id);
    setCurrentView('chat');
    window.history.pushState(null, '', `#chat=${encodeURIComponent(id)}`);
  };

  return (
    <main className="app-shell flex h-screen overflow-hidden">
      <AgeVerification />
      <Sidebar
        onNavigate={navigate}
        onSelectChat={openChat}
        currentView={currentView}
        currentChatId={currentChatId || undefined}
      />

      <div className="flex flex-1">
        {currentView === 'admin' ? (
          <AdminDashboard />
        ) : currentChatId ? (
          <ChatRoom chatId={currentChatId} onOpenChat={openChat} />
        ) : currentView === 'dms' || currentView === 'groups' || currentView === 'discover' || currentView === 'settings' ? (
          <ChatDirectory view={currentView} onSelectChat={openChat} />
        ) : (
          <HomeDashboard onNavigate={navigate} onSelectChat={openChat} />
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <AppProviders>
      <HomeContent />
    </AppProviders>
  );
}
