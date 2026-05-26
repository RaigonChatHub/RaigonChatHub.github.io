'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Bell, CheckCircle2, Loader2, MessageSquare, RefreshCw, Search, Trash2, User } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastProvider';

type UserProfile = {
  id: string;
  username: string;
  display_name: string | null;
  age: number | null;
  parent_approved: boolean;
  role: string;
  banned: boolean | null;
  ban_reason: string | null;
  admin_alert: string | null;
};

type Chat = {
  id: string;
  name: string | null;
  is_discoverable: boolean;
};

export default function AdminDashboard() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [alertDrafts, setAlertDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [{ data: userData, error: userError }, { data: chatData, error: chatError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, display_name, age, parent_approved, role, banned, ban_reason, admin_alert')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.from('chats').select('id, name, is_discoverable').order('created_at', { ascending: false }).limit(80),
    ]);

    if (userError || chatError) {
      showToast({
        title: 'Admin data failed to load',
        description: userError?.message ?? chatError?.message,
        variant: 'error',
      });
    }

    const nextUsers = (userData ?? []) as UserProfile[];
    setUsers(nextUsers);
    setAlertDrafts(
      nextUsers.reduce<Record<string, string>>((drafts, user) => {
        drafts[user.id] = user.admin_alert ?? '';
        return drafts;
      }, {}),
    );
    setChats((chatData ?? []) as Chat[]);
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    // Initial admin data is external Supabase state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (profile?.role !== 'admin') {
    return <div className="app-panel flex-1 p-8 text-red-400">Access denied</div>;
  }

  const deleteChat = async () => {
    if (!chatToDelete) return;

    setDeleting(true);
    const { error } = await supabase.from('chats').delete().eq('id', chatToDelete.id);

    if (error) {
      showToast({
        title: 'Could not delete chat',
        description: error.message,
        variant: 'error',
      });
    } else {
      setChats((items) => items.filter((chat) => chat.id !== chatToDelete.id));
      showToast({ title: 'Chat deleted', variant: 'success' });
      setChatToDelete(null);
    }

    setDeleting(false);
  };

  const setBan = async (user: UserProfile, banned: boolean) => {
    setBusyUserId(user.id);
    const { error } = await supabase.rpc('set_user_ban', {
      target_user_id: user.id,
      banned_value: banned,
      reason: banned ? user.ban_reason || 'Restricted by platform admin.' : null,
    });

    if (error) {
      showToast({ title: 'Moderation failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: banned ? 'User banned' : 'User unbanned', variant: 'success' });
      await fetchData();
    }

    setBusyUserId(null);
  };

  const saveAlert = async (user: UserProfile) => {
    setBusyUserId(user.id);
    const { error } = await supabase.rpc('set_user_alert', {
      target_user_id: user.id,
      alert_text: alertDrafts[user.id] ?? '',
    });

    if (error) {
      showToast({ title: 'Alert failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: alertDrafts[user.id] ? 'Alert sent' : 'Alert cleared', variant: 'success' });
      await fetchData();
    }

    setBusyUserId(null);
  };

  const visibleUsers = users.filter((user) => {
    const text = `${user.username} ${user.display_name ?? ''} ${user.role}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  return (
    <div className="app-panel flex-1 overflow-y-auto p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-primary">Platform Admin</h2>
          <p className="mt-1 text-sm text-muted">Fast moderation controls for users and chats.</p>
        </div>
        <button type="button" onClick={fetchData} className="ui-button secondary px-3 py-2 text-sm">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search users"
          className="form-input search-input w-full py-2.5 pr-4 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading admin data
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
          <section className="surface-card p-4">
            <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-primary">
              <User className="h-5 w-5 text-rainbow-blue" /> Users
            </h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              {visibleUsers.map((user) => {
                const busy = busyUserId === user.id;
                const isSelf = user.id === profile.id;

                return (
                  <div key={user.id} className="grid gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-3 last:border-b-0 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-primary">{user.display_name || user.username}</p>
                      <p className="text-xs text-muted">@{user.username} / {user.role} / {user.age ?? 'N/A'}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {user.banned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-xs font-bold text-red-500">
                            <Ban className="h-3 w-3" /> Banned
                          </span>
                        )}
                        {user.admin_alert && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-500">
                            <Bell className="h-3 w-3" /> Alerted
                          </span>
                        )}
                        {user.age !== null && user.age < 13 && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
                              user.parent_approved ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {user.parent_approved ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {user.parent_approved ? 'Parent approved' : 'Parent pending'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        value={alertDrafts[user.id] ?? ''}
                        onChange={(event) => setAlertDrafts((drafts) => ({ ...drafts, [user.id]: event.target.value }))}
                        placeholder="Write an account alert..."
                        className="form-input min-w-0 px-3 py-2 text-sm"
                      />
                      <button type="button" onClick={() => saveAlert(user)} disabled={busy} className="ui-button secondary px-3 py-2 text-sm">
                        {alertDrafts[user.id] ? 'Send alert' : 'Clear alert'}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setBan(user, !user.banned)}
                        disabled={busy || isSelf}
                        className={`ui-button px-3 py-2 text-sm text-white disabled:opacity-50 ${
                          user.banned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                        }`}
                      >
                        {user.banned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="surface-card p-4">
            <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-primary">
              <MessageSquare className="h-5 w-5 text-rainbow-blue" /> Chats
            </h3>
            <div className="space-y-3">
              {chats.map((chat) => (
                <div key={chat.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-elevated)] p-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-primary">{chat.name || 'Private chat'}</p>
                    <p className="text-xs text-muted">{chat.is_discoverable ? 'Public' : 'Private'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatToDelete(chat)}
                    aria-label={`Delete ${chat.name || 'chat'}`}
                    className="rounded-lg p-2 text-muted transition hover:bg-[var(--danger-soft)] hover:text-red-500"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(chatToDelete)}
        title="Delete chat?"
        description={`This permanently removes "${chatToDelete?.name || 'this chat'}" and its messages.`}
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setChatToDelete(null)}
        onConfirm={deleteChat}
      />
    </div>
  );
}
