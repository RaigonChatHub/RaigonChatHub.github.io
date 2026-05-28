'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Sidebar, { HubView } from '@/components/Sidebar';
import ChatRoom from '@/components/ChatRoom';
import AdminDashboard from '@/components/AdminDashboard';
import Login from '@/components/Login';
import AgeVerification from '@/components/AgeVerification';
import ChatDirectory from '@/components/ChatDirectory';
import BugReport from '@/components/BugReport';
import BotWorkspace from '@/components/BotWorkspace';
import AppProviders from '@/components/AppProviders';
import NotificationBell from '@/components/NotificationBell';
import { createClient } from '@/lib/supabase';
import { Compass, MessageSquare, Plus, Users, X, Sparkles, AlertTriangle, History, ChevronRight, Clock } from 'lucide-react';
import { format } from 'date-fns';

const APP_VERSION = '1.3.1';

function readHashRoute(): { view: HubView; chatId: string | null } {
  if (typeof window === 'undefined') return { view: 'home', chatId: null };

  const rawHash = window.location.hash.replace(/^#/, '');
  if (!rawHash) return { view: 'home', chatId: null };

  if (rawHash.startsWith('chat=')) {
    const params = new URLSearchParams(rawHash);
    return { view: 'chat' as any, chatId: params.get('chat') };
  }

  const validViews: HubView[] = [
    'home', 'dms', 'groups', 'discover', 'settings', 'admin', 'bug_report', 'bot_workspace',
    'admin_users', 'admin_chats', 'admin_bots', 'admin_reports', 'admin_updates'
  ];

  if (validViews.includes(rawHash as HubView)) {
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

type UpdateLog = {
  id: string;
  version: string;
  title: string;
  content: string;
  created_at: string;
};

function HomeDashboard({
  onNavigate,
  onSelectChat,
  onShowUpdates,
}: {
  onNavigate: (view: HubView) => void;
  onSelectChat: (id: string) => void;
  onShowUpdates: () => void;
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
              Welcome back, <span className={profile?.role === 'admin' ? 'rainbow-name' : ''}>{profile?.display_name || profile?.username}</span>
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

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <QuickAction icon={MessageSquare} label="Start a DM" onClick={() => onNavigate('dms')} />
          <QuickAction icon={Users} label="Your groups" onClick={() => onNavigate('groups')} />
          <QuickAction icon={Compass} label="Discover" onClick={() => onNavigate('discover')} />
          <QuickAction icon={History} label="Update Log" onClick={onShowUpdates} />
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
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [currentView, setCurrentView] = useState<HubView>('home');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [updateHistory, setUpdateHistory] = useState<UpdateLog[]>([]);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
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

    // Auto-report fatal errors
    const handleError = (e: ErrorEvent) => {
       supabase.rpc('submit_report', {
         report_type: 'bug',
         report_content: `FATAL CLIENT ERROR: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`
       });
    };
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('hashchange', applyHashRoute);
      window.removeEventListener('error', handleError);
    };
  }, [supabase]);

  useEffect(() => {
    const checkUpdate = async () => {
      if (profile && profile.last_seen_version !== APP_VERSION) {
        setShowUpdateLog(true);
        const { error } = await supabase.from('profiles').update({ last_seen_version: APP_VERSION }).eq('id', profile.id);
        if (!error) refreshProfile();
      }
    };
    checkUpdate();
  }, [profile, supabase, refreshProfile]);

  const fetchHistory = async () => {
     setViewingHistory(true);
     const { data } = await supabase.from('update_logs').select('*').order('created_at', { ascending: false });
     setUpdateHistory((data ?? []) as UpdateLog[]);
  };

  if (!mounted || authLoading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-600 border-t-transparent shadow-[0_0_20px_rgba(14,165,233,0.2)]" />
      </div>
    );
  }

  if (!user) return <Login />;
  if (profile?.age === null) return <AgeVerification />;

  // Platform Ban Check
  if (profile?.banned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-8 text-center">
        <div className="max-w-xl surface-card p-12 border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.2)] rounded-xl">
          <h1 className="text-5xl font-black text-red-500 uppercase tracking-tight">Access Terminated</h1>
          <div className="mt-10 p-8 bg-red-500/10 rounded-xl text-left border border-red-500/20">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Termination Rationale</p>
            <p className="mt-3 text-lg text-primary font-semibold leading-relaxed">{profile.ban_reason || 'System policy violation.'}</p>
            {profile.ban_expires_at && (
              <>
                <p className="mt-8 text-[10px] font-black text-red-400 uppercase tracking-widest">Expiration</p>
                <p className="mt-3 text-lg text-primary font-semibold font-mono">{new Date(profile.ban_expires_at).toLocaleString()}</p>
              </>
            )}
          </div>
          <p className="mt-10 text-muted text-sm font-semibold leading-relaxed uppercase tracking-wide opacity-60">
            Your identity has been fully restricted from the network.
          </p>
          <button onClick={() => supabase.auth.signOut()} className="ui-button primary mt-12 w-full py-5 font-black uppercase tracking-[0.2em] shadow-2xl">LOG OUT OF TERMINAL</button>
        </div>
      </div>
    );
  }

  const navigate = (view: HubView) => {
    setCurrentChatId(null);
    setCurrentView(view);
    window.location.hash = view;
  };

  const openChat = (id: string) => {
    setCurrentChatId(id);
    setCurrentView('chat' as any);
    window.location.hash = `chat=${encodeURIComponent(id)}`;
  };

  return (
    <main className="app-shell flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        onNavigate={navigate}
        onSelectChat={openChat}
        currentView={currentView}
        currentChatId={currentChatId || undefined}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {currentView.startsWith('admin') ? (
          <AdminDashboard section={currentView} />
        ) : currentView === 'bug_report' ? (
          <BugReport />
        ) : currentView === 'bot_workspace' ? (
          <BotWorkspace />
        ) : currentChatId ? (
          <ChatRoom chatId={currentChatId} onOpenChat={openChat} />
        ) : currentView === 'dms' || currentView === 'groups' || currentView === 'discover' || currentView === 'settings' ? (
          <ChatDirectory view={currentView as any} onSelectChat={openChat} />
        ) : (
          <HomeDashboard onNavigate={navigate} onSelectChat={openChat} onShowUpdates={() => setShowUpdateLog(true)} />
        )}

        <NotificationBell />
      </div>

      {/* Update Hub Overlay */}
      {showUpdateLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-500">
           <div className="max-w-sm w-full surface-card p-6 shadow-2xl relative border border-sky-500/30 rounded-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500" />
              
              <div className="relative z-10 flex flex-col flex-1 min-h-0">
                <header className="text-center shrink-0 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 mb-4 mx-auto">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-black text-primary tracking-tight uppercase">
                    {viewingHistory ? 'ARCHIVES' : 'PATCH NOTES'}
                  </h2>
                  <p className="mt-1 text-[10px] text-sky-400 font-black uppercase tracking-widest">{viewingHistory ? 'SYSTEM HISTORY' : `Version ${APP_VERSION} ACTIVE`}</p>
                </header>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                   {viewingHistory ? (
                      updateHistory.map(log => (
                        <div key={log.id} className="p-4 bg-white/5 rounded-xl border border-white/5 border-l-2 border-l-sky-500">
                           <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-bold text-primary">{log.title}</h4>
                              <span className="text-[8px] font-black bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">V{log.version}</span>
                           </div>
                           <p className="text-[10px] text-muted leading-relaxed whitespace-pre-wrap">{log.content}</p>
                        </div>
                      ))
                   ) : (
                      <div className="space-y-2">
                        <UpdateItem title="Admin Center" desc="Users, chats, and real-time reports." />
                        <UpdateItem title="Black Box" desc="Message context capture." />
                        <UpdateItem title="Transfers" desc="Ownership handovers." />
                      </div>
                   )}
                </div>

                <div className="mt-6 shrink-0 flex flex-col gap-3">
                  {!viewingHistory && (
                     <button onClick={fetchHistory} className="text-[9px] font-black text-muted uppercase tracking-widest flex items-center justify-center gap-2 hover:text-primary transition-all">
                        <History className="h-3 w-3" />
                        VIEW HISTORY
                     </button>
                  )}
                  <button
                    onClick={() => { setShowUpdateLog(false); setViewingHistory(false); }}
                    className="ui-button primary w-full py-3 text-xs font-black tracking-widest shadow-xl text-white"
                  >
                    {viewingHistory ? 'BACK TO CORE' : 'PATCH APPLIED'}
                  </button>
                </div>
              </div>
           </div>
        </div>
      )}
    </main>
  );
}

function UpdateItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-6 bg-white/5 rounded-3xl border border-white/5 text-left group hover:bg-white/10 transition-all border-l-4 border-l-transparent hover:border-l-sky-500">
       <div className="flex items-center gap-4 mb-2">
          <div className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
          <p className="font-bold text-primary text-xl group-hover:text-sky-400 transition-colors">{title}</p>
       </div>
       <p className="text-sm text-muted font-medium ml-6 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{desc}</p>
    </div>
  );
}

export default function Home() {
  return (
    <AppProviders>
      <HomeContent />
    </AppProviders>
  );
}
