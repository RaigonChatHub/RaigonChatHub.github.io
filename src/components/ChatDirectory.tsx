'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Calendar, Compass, Image as ImageIcon, Loader2, Mail, MessageSquare, Moon, Palette, Plus, Save, Search, Settings, Sun, User, UserPlus, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from './ToastProvider';

type DirectoryView = 'dms' | 'groups' | 'discover' | 'settings';

type Chat = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_discoverable: boolean;
  image_url: string | null;
  banner_url: string | null;
  created_by: string | null;
  last_activity_at: string | null;
};

function readRpcChatId(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    return typeof first?.chat_id === 'string' ? first.chat_id : null;
  }
  if (data && typeof data === 'object') {
    const maybeObject = data as Record<string, unknown>;
    return typeof maybeObject.chat_id === 'string' ? maybeObject.chat_id : null;
  }
  return null;
}

const viewConfig = {
  dms: {
    title: 'Direct messages',
    description: 'Private conversations you are a member of appear here.',
    icon: MessageSquare,
    empty: 'No direct messages yet.',
  },
  groups: {
    title: 'Groups',
    description: 'Create and open member-only group chats.',
    icon: Users,
    empty: 'No group chats available yet.',
  },
  discover: {
    title: 'Discover',
    description: 'Join public rooms and start talking.',
    icon: Compass,
    empty: 'No public rooms are available yet.',
  },
  settings: {
    title: 'Settings',
    description: 'Profile, safety, appearance, and account controls.',
    icon: Settings,
    empty: '',
  },
};

export default function ChatDirectory({
  view,
  onSelectChat,
}: {
  view: DirectoryView;
  onSelectChat: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [myChatIds, setMyChatIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [joiningChatId, setJoiningChatId] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatImageUrl, setNewChatImageUrl] = useState('');
  const [newChatBannerUrl, setNewChatBannerUrl] = useState('');
  const [newChatDiscoverable, setNewChatDiscoverable] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dmUsername, setDmUsername] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [parentEmail, setParentEmail] = useState(profile?.parent_email ?? '');
  const [newPassword, setNewPassword] = useState('');

  const config = viewConfig[view];
  const Icon = config.icon;

  useEffect(() => {
    // Keep the edit form in sync after login/profile refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(profile?.display_name ?? '');
    setUsername(profile?.username ?? '');
    setParentEmail(profile?.parent_email ?? '');
  }, [profile]);

  useEffect(() => {
    if (view === 'settings') return;

    const fetchChats = async () => {
      setLoading(true);
      const [{ data, error }, { data: membershipData, error: membershipError }] = await Promise.all([
        supabase
          .from('chats')
          .select('id, name, is_group, is_discoverable, image_url, banner_url, created_by, last_activity_at')
          .order('last_activity_at', { ascending: false }),
        supabase.rpc('get_my_chat_ids'),
      ]);

      if (error || membershipError) {
        showToast({
          title: 'Could not load chats',
          description: error?.message ?? membershipError?.message,
          variant: 'error',
        });
        setChats([]);
      } else {
        setChats((data ?? []) as Chat[]);
        setMyChatIds(new Set(((membershipData ?? []) as { chat_id: string }[]).map((item) => item.chat_id)));
      }

      setLoading(false);
    };

    fetchChats();
  }, [showToast, supabase, view]);

  const filteredChats = chats.filter((chat) => {
    const matchesSearch = !searchQuery.trim() || (chat.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (view === 'discover') return chat.is_discoverable;
    if (view === 'groups') return chat.is_group && myChatIds.has(chat.id);
    if (view === 'dms') return !chat.is_group && myChatIds.has(chat.id);
    return false;
  });

  const createChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !newChatName.trim() || creating) return;

    setCreating(true);
    const { data, error: chatError } = await supabase.rpc('create_group_chat', {
      chat_name: newChatName.trim(),
      make_discoverable: newChatDiscoverable,
      chat_image_url: newChatImageUrl.trim() || null,
      chat_banner_url: newChatBannerUrl.trim() || null,
    });

    const chatId = readRpcChatId(data);

    if (chatError || !chatId) {
      showToast({
        title: 'Could not create chat',
        description: chatError?.message ?? 'Supabase did not return the created chat.',
        variant: 'error',
      });
      setCreating(false);
      return;
    }

    setNewChatName('');
    setNewChatImageUrl('');
    setNewChatBannerUrl('');
    setNewChatDiscoverable(false);
    setCreateOpen(false);
    showToast({ title: 'Chat created', variant: 'success' });
    onSelectChat(chatId);
    setCreating(false);
  };

  const joinChat = async (chatId: string) => {
    if (!profile || joiningChatId) return;

    setJoiningChatId(chatId);
    const { error } = await supabase.rpc('join_discoverable_chat', {
      target_chat_id: chatId,
    });

    if (error) {
      showToast({
        title: 'Could not join chat',
        description: error.message,
        variant: 'error',
      });
    } else {
      showToast({ title: 'Joined chat', variant: 'success' });
      setMyChatIds((items) => new Set(items).add(chatId));
      onSelectChat(chatId);
    }

    setJoiningChatId(null);
  };

  const startDirectMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !dmUsername.trim() || startingDm) return;

    setStartingDm(true);
    const { data, error } = await supabase.rpc('create_direct_message_by_username', {
      target_username: dmUsername.trim(),
    });

    if (error) {
      showToast({
        title: 'Could not start DM',
        description: error.message,
        variant: 'error',
      });
    } else {
      const chatId = readRpcChatId(data);

      if (chatId) {
        setDmUsername('');
        showToast({ title: 'Direct message ready', variant: 'success' });
        onSelectChat(chatId);
      } else {
        showToast({
          title: 'Could not start DM',
          description: 'Supabase did not return a chat id.',
          variant: 'error',
        });
      }
    }

    setStartingDm(false);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || savingProfile) return;

    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        username: username.trim(),
        parent_email: parentEmail.trim() || null,
      })
      .eq('id', profile.id);

    if (error) {
      showToast({ title: 'Profile update failed', description: error.message, variant: 'error' });
    } else {
      await refreshProfile();
      showToast({ title: 'Profile saved', variant: 'success' });
    }

    setSavingProfile(false);
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPassword.trim() || changingPassword) return;

    if (newPassword.length < 8) {
      showToast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'error' });
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      showToast({ title: 'Password update failed', description: error.message, variant: 'error' });
    } else {
      setNewPassword('');
      showToast({ title: 'Password updated', variant: 'success' });
    }

    setChangingPassword(false);
  };

  if (view === 'settings') {
    return (
      <section className="app-panel flex-1 overflow-y-auto p-8">
        <Header config={config} />

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={saveProfile} className="surface-card p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
              <User className="h-5 w-5 text-rainbow-blue" />
              Profile
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Max" />
              <Field label="Username" value={username} onChange={setUsername} placeholder="Admin" required />
              <Field label="Email" value={user?.email ?? ''} onChange={() => {}} placeholder="" disabled />
              {typeof profile?.age === 'number' && profile.age < 13 && <Field label="Parent email" value={parentEmail} onChange={setParentEmail} placeholder="parent@example.com" />}
            </div>
            <button type="submit" disabled={savingProfile || !username.trim()} className="ui-button primary mt-6 px-4 py-2.5">
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
          </form>

          <div className="space-y-6">
            <form onSubmit={changePassword} className="surface-card p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
                <Settings className="h-5 w-5 text-rainbow-blue" />
                Password
              </h3>
              <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} placeholder="At least 8 characters" />
              <button type="submit" disabled={changingPassword || newPassword.length < 8} className="ui-button primary mt-5 w-full py-2.5">
                {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Change password
              </button>
            </form>

            <section className="surface-card p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
                <Palette className="h-5 w-5 text-rainbow-blue" />
                Appearance
              </h3>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`ui-button secondary px-3 py-3 ${theme === 'light' ? 'ring-2 ring-[var(--accent)]' : ''}`}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`ui-button secondary px-3 py-3 ${theme === 'dark' ? 'ring-2 ring-[var(--accent)]' : ''}`}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </button>
              </div>
            </section>

            <section className="surface-card p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
                <Calendar className="h-5 w-5 text-rainbow-blue" />
                Account status
              </h3>
              <dl className="mt-5 space-y-3 text-sm">
                <InfoRow label="Role" value={profile?.role ?? 'user'} />
                <InfoRow label="Age" value={profile?.age === null ? 'Not set' : String(profile?.age)} />
                <InfoRow label="Parent approval" value={profile?.parent_approved ? 'Approved' : 'Not approved'} />
                <InfoRow label="Email" value={user?.email ?? 'Unknown'} />
              </dl>
              <button type="button" onClick={signOut} className="ui-button secondary mt-6 w-full py-2.5">
                Sign out
              </button>
            </section>

            <section className="surface-card p-6">
              <h3 className="text-lg font-bold text-primary">Legal</h3>
              <div className="mt-4 grid gap-2 text-sm">
                <Link href="/terms/" className="text-link transition hover:text-link-hover">Terms of Service</Link>
                <Link href="/privacy/" className="text-link transition hover:text-link-hover">Privacy Policy</Link>
              </div>
            </section>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="app-panel flex-1 overflow-y-auto p-8">
      <Header config={config} />

      <div className="mt-8 flex max-w-3xl flex-wrap gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={view === 'discover' ? 'Search public chats' : view === 'groups' ? 'Search your groups' : 'Search DMs'}
            className="form-input search-input w-full py-3 pr-4 text-sm"
          />
        </div>
        {view === 'groups' && (
          <button type="button" onClick={() => setCreateOpen(true)} className="ui-button primary px-4 py-3 text-sm">
            <Plus className="h-4 w-4" />
            Create
          </button>
        )}
      </div>

      {view === 'dms' && (
        <form onSubmit={startDirectMessage} className="mt-4 flex max-w-3xl gap-3">
          <input
            type="text"
            value={dmUsername}
            onChange={(event) => setDmUsername(event.target.value)}
            placeholder="Start a DM by username"
            className="form-input min-w-0 flex-1 px-4 py-3 text-sm"
          />
          <button type="submit" disabled={startingDm || !dmUsername.trim()} className="ui-button primary px-4 py-3 text-sm">
            {startingDm ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Start
          </button>
        </form>
      )}

      <div className="mt-8 grid gap-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chats
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="surface-card border-dashed p-8 text-center">
            <Icon className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-sm text-muted">{config.empty}</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div key={chat.id} className="surface-card flex items-center justify-between p-4">
              <button type="button" onClick={() => onSelectChat(chat.id)} className="min-w-0 flex flex-1 items-center gap-3 text-left">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-bold text-rainbow-blue">
                  {chat.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chat.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (chat.name || 'R')[0]
                  )}
                </div>
                <div className="min-w-0">
                <p className="truncate font-semibold text-primary">{chat.name || 'Untitled chat'}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                  {chat.is_discoverable ? 'Public room' : chat.is_group ? 'Private group' : 'Direct message'}
                  <span aria-hidden="true">/</span>
                  {chat.last_activity_at ? `${formatDistanceToNow(new Date(chat.last_activity_at))} ago` : 'No activity yet'}
                </p>
                </div>
              </button>
              {view === 'discover' && (
                <button
                  type="button"
                  onClick={() => joinChat(chat.id)}
                  disabled={joiningChatId === chat.id || myChatIds.has(chat.id)}
                  className={`ui-button secondary ml-4 px-3 py-2 text-xs ${myChatIds.has(chat.id) ? 'opacity-60' : ''}`}
                >
                  {myChatIds.has(chat.id) ? 'Joined' : joiningChatId === chat.id ? 'Joining...' : 'Join'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={createChat} className="surface-card w-full max-w-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-primary">Create group</h3>
                <p className="mt-1 text-sm text-muted">Create a private group or a discoverable public room.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close create group" className="ui-button secondary h-9 w-9 p-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <Field label="Group name" value={newChatName} onChange={setNewChatName} placeholder="Dragon lounge" required />
              <Field label="Group image URL" value={newChatImageUrl} onChange={setNewChatImageUrl} placeholder="https://example.com/icon.png" />
              <Field label="Banner URL" value={newChatBannerUrl} onChange={setNewChatBannerUrl} placeholder="https://example.com/banner.png" />
              <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
                <span>
                  <span className="block text-sm font-bold text-primary">Discoverable public room</span>
                  <span className="text-xs text-muted">Show this chat in Discover so anyone can join.</span>
                </span>
                <input type="checkbox" checked={newChatDiscoverable} onChange={(event) => setNewChatDiscoverable(event.target.checked)} />
              </label>
            </div>
            <button type="submit" disabled={creating || !newChatName.trim()} className="ui-button primary mt-6 w-full py-3">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Create group
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function Header({ config }: { config: (typeof viewConfig)[DirectoryView] }) {
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-rainbow-blue">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-primary">{config.title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{config.description}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-primary">{label}</label>
      <input
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="form-input w-full px-4 py-3 text-sm disabled:opacity-70"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-muted">
        {label === 'Email' && <Mail className="h-4 w-4" />}
        {label}
      </dt>
      <dd className="truncate font-semibold text-primary">{value}</dd>
    </div>
  );
}
