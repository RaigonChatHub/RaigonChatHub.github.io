'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Calendar, Compass, Image as ImageIcon, Loader2, Mail, MessageSquare, Moon, Palette, Plus, Save, Search, Settings, Sun, User, UserPlus, Users, X, Info } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from './ToastProvider';
import ConfirmDialog from './ConfirmDialog';
import CustomDropdown from './CustomDropdown';

type DirectoryView = 'dms' | 'groups' | 'discover' | 'settings';

type Chat = {
  id: string;
  name: string | null;
  description: string | null;
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
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [myChatIds, setMyChatIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [joiningChatId, setJoiningChatId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [themePref, setThemePref] = useState<string>(profile?.theme_pref ?? 'dark');
  const [density, setDensity] = useState<string>(profile?.message_density ?? 'comfortable');
  const [fontSize, setFontSize] = useState<string>(profile?.font_size_pref ?? 'medium');
  const [language, setLanguage] = useState<string>(profile?.language_pref ?? 'en');
  const [showOnline, setShowOnline] = useState(profile?.privacy_options?.show_online ?? true);
  const [enterSends, setEnterSends] = useState(profile?.default_chat_behavior?.enter_sends ?? true);
  const [soundsEnabled, setSoundsEnabled] = useState(profile?.sound_settings?.enabled ?? true);
  const [compactSidebar, setCompactSidebar] = useState(profile?.account_preferences?.compact_sidebar ?? true);
  const [showMessagePreviews, setShowMessagePreviews] = useState(profile?.privacy_options?.show_message_previews ?? true);
  const [reduceMotion, setReduceMotion] = useState(profile?.accessibility_prefs?.reduce_motion ?? false);
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState(false);

  const [newChat, setNewChat] = useState({ name: '', description: '', image: '', banner: '', discoverable: false });

  const config = viewConfig[view];
  const Icon = config.icon;

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setUsername(profile.username ?? '');
      setAvatarUrl(profile.avatar_url ?? '');
      setBio(profile.bio ?? '');
      setThemePref(profile.theme_pref ?? 'dark');
      setDensity(profile.message_density ?? 'comfortable');
      setFontSize(profile.font_size_pref ?? 'medium');
      setLanguage(profile.language_pref ?? 'en');
      setShowOnline(profile.privacy_options?.show_online ?? true);
      setEnterSends(profile.default_chat_behavior?.enter_sends ?? true);
      setSoundsEnabled(profile.sound_settings?.enabled ?? true);
      setCompactSidebar(profile.account_preferences?.compact_sidebar ?? true);
      setShowMessagePreviews(profile.privacy_options?.show_message_previews ?? true);
      setReduceMotion(profile.accessibility_prefs?.reduce_motion ?? false);
    }
  }, [profile]);

  const fetchChats = async () => {
    if (view === 'settings') return;
    setLoading(true);
    try {
      const [{ data, error }, { data: membershipData, error: membershipError }] = await Promise.all([
        supabase.from('chats').select('*').order('last_activity_at', { ascending: false }),
        supabase.rpc('get_my_chat_ids'),
      ]);

      if (!error && !membershipError) {
        setChats((data ?? []) as Chat[]);
        setMyChatIds(new Set(((membershipData ?? []) as { chat_id: string }[]).map(i => i.chat_id)));
      }
    } catch (err: any) {
      showToast({ title: 'Fetch error', description: err.message, variant: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchChats(); }, [view, supabase]);

  const filteredChats = chats.filter((chat) => {
    const matchesSearch = !searchQuery.trim() || (chat.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
    if (!matchesSearch) return false;

    const isMember = myChatIds.has(chat.id);
    if (view === 'discover') return chat.is_discoverable && !isMember;
    if (view === 'groups') return chat.is_group && isMember;
    if (view === 'dms') return !chat.is_group && isMember;
    return false;
  });

  const handleJoin = async (id: string) => {
     setJoiningChatId(id);
     const { error } = await supabase.rpc('join_discoverable_chat', { target_chat_id: id });
     if (!error) {
        showToast({ title: 'Joined Room', variant: 'success' });
        fetchChats();
        onSelectChat(id);
     } else {
        showToast({ title: 'Join failed', description: error.message, variant: 'error' });
     }
     setJoiningChatId(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!profile) return;
     setSavingProfile(true);
     const { error } = await supabase.from('profiles').update({
        display_name: displayName.trim(),
        username: username.trim(),
        avatar_url: avatarUrl.trim(),
        bio: bio.trim(),
        theme_pref: themePref,
        message_density: density,
        font_size_pref: fontSize,
        language_pref: language,
        privacy_options: { ...profile.privacy_options, show_online: showOnline, show_message_previews: showMessagePreviews },
        default_chat_behavior: { ...profile.default_chat_behavior, enter_sends: enterSends },
        sound_settings: { ...profile.sound_settings, enabled: soundsEnabled },
        accessibility_prefs: { ...profile.accessibility_prefs, reduce_motion: reduceMotion },
        account_preferences: { ...profile.account_preferences, compact_sidebar: compactSidebar }
     }).eq('id', profile.id);

     if (!error) {
        showToast({ title: 'Profile Updated', variant: 'success' });
        if (themePref !== theme) setTheme(themePref as any);
        refreshProfile();
     } else {
        showToast({ title: 'Update failed', description: error.message, variant: 'error' });
     }
     setSavingProfile(false);
  };

  const deleteAccount = async () => {
    showToast({ title: 'Account deletion requested', variant: 'info' });
    setAccountDeleteConfirm(false);
  };

  if (view === 'settings') {
    return (
      <section className="app-panel flex-1 overflow-y-auto p-8 bg-[var(--background)]">
        <Header config={config} />

        <form onSubmit={handleSaveProfile} className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <section className="surface-card p-6 rounded-2xl border border-[var(--border)]">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-primary uppercase tracking-tight mb-6">
                <User className="h-5 w-5 text-rainbow-blue" />
                Profile Identity
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Display Name" value={displayName} onChange={setDisplayName} placeholder="Max Raigon" />
                <Field label="Username" value={username} onChange={setUsername} placeholder="admin" required />
                <div className="md:col-span-2">
                   <Field label="Avatar URL" value={avatarUrl} onChange={setAvatarUrl} placeholder="https://example.com/me.png" />
                </div>
                <div className="md:col-span-2">
                  <div className="p-4 bg-sky-500/5 border border-sky-500/10 rounded-xl">
                    <p className="text-xs font-bold text-sky-500 uppercase tracking-wider">Presence Control</p>
                    <p className="text-sm text-muted mt-1 leading-relaxed">Your status is now managed automatically based on your activity on the platform.</p>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold uppercase text-muted tracking-wider px-1">About Me</label>
                  <textarea value={bio} onChange={(e: any) => setBio(e.target.value)} placeholder="Share your story..." className="form-input w-full min-h-[100px] p-4 text-sm" />
                </div>
              </div>
            </section>

            <section className="surface-card p-6 rounded-2xl border border-[var(--border)]">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-primary uppercase tracking-tight mb-6">
                <Palette className="h-5 w-5 text-rainbow-blue" />
                User Experience
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <CustomDropdown label="Interface Theme" value={themePref} onChange={setThemePref} options={[{v:'dark', l:'Dark Mode'}, {v:'light', l:'Light Mode'}]} />
                <CustomDropdown label="Platform Language" value={language} onChange={setLanguage} options={[{v:'en', l:'English'}, {v:'es', l:'Spanish'}, {v:'fr', l:'French'}]} />
                <CustomDropdown label="Message Density" value={density} onChange={setDensity} options={[{v:'comfortable', l:'Comfortable'}, {v:'compact', l:'Compact'}]} />
                <CustomDropdown label="Text Font Size" value={fontSize} onChange={setFontSize} options={[{v:'small', l:'Small'}, {v:'medium', l:'Medium'}, {v:'large', l:'Large'}]} />
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <button type="submit" disabled={savingProfile} className="ui-button primary w-full py-4 text-lg font-semibold tracking-tight uppercase  rounded-xl transition-all">
              {savingProfile ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'SAVE CHANGES'}
            </button>

            <section className="surface-card p-6 rounded-2xl border border-[var(--border)] space-y-4">
              <h3 className="text-xs font-bold text-muted uppercase tracking-[0.2em]">Platform Preferences</h3>
              <div className="space-y-3">
                 <ToggleRow label="Show Activity Status" description="Let others see when you are active." checked={showOnline} onChange={setShowOnline} />
                 <ToggleRow label="Show Message Previews" description="Display message snippets in notification surfaces." checked={showMessagePreviews} onChange={setShowMessagePreviews} />
                 <ToggleRow label="Immediate Send" description="Pressing Enter sends your message." checked={enterSends} onChange={setEnterSends} />
                 <ToggleRow label="Audio Notifications" description="Play sounds for new messages." checked={soundsEnabled} onChange={setSoundsEnabled} />
                 <ToggleRow label="Compact Sidebar" description="Keep the side rail tight on chat screens." checked={compactSidebar} onChange={setCompactSidebar} />
                 <ToggleRow label="Reduce Motion" description="Limit interface animation where possible." checked={reduceMotion} onChange={setReduceMotion} />
              </div>
            </section>

            <section className="p-6 border-2 border-red-500/10 rounded-2xl bg-red-500/5 space-y-3">
               <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider">Danger Zone</h3>
               <button type="button" onClick={() => setAccountDeleteConfirm(true)} className="ui-button bg-red-600 text-white w-full py-3 font-semibold uppercase tracking-tight shadow-md">DELETE ACCOUNT</button>
            </section>

            <button type="button" onClick={signOut} className="ui-button secondary w-full py-3 font-semibold text-red-400 uppercase tracking-wider">SIGN OUT</button>
          </div>
        </form>

        <ConfirmDialog open={accountDeleteConfirm} title="DELETE ACCOUNT?" description="This action will permanently purge your identity and data. This cannot be undone." confirmLabel="PURGE ACCOUNT" onCancel={() => setAccountDeleteConfirm(false)} onConfirm={deleteAccount} />
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
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={view === 'discover' ? 'Search public chats' : view === 'groups' ? 'Search your groups' : 'Search DMs'}
            className="form-input search-input w-full py-3 pr-4 text-sm"
          />
        </div>
        {view === 'groups' && (
          <button onClick={() => setCreateOpen(true)} className="ui-button primary px-4 py-3 text-sm"><Plus className="h-4 w-4" /> Create</button>
        )}
      </div>

      <div className="mt-8 grid gap-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />Loading chats</div>
        ) : filteredChats.length === 0 ? (
          <div className="surface-card border-dashed p-8 text-center">
            <Icon className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-sm text-muted">{config.empty}</p>
          </div>
        ) : (
          filteredChats.map(chat => (
            <div key={chat.id} className="surface-card flex items-center justify-between p-4">
              <button type="button" onClick={() => onSelectChat(chat.id)} className="min-w-0 flex flex-1 items-center gap-3 text-left">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-bold text-rainbow-blue">
                   {chat.image_url ? <img src={chat.image_url} alt="" className="h-full w-full object-cover" /> : (chat.name || 'R')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                   <p className="truncate font-semibold text-primary">{chat.name || 'Untitled chat'}</p>
                   <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {chat.is_discoverable ? 'Public room' : chat.is_group ? 'Private group' : 'Direct message'}
                      {chat.last_activity_at && <><span className="h-1 w-1 rounded-full bg-muted" /> {formatDistanceToNow(new Date(chat.last_activity_at))} ago</>}
                   </p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                 {view === 'discover' ? (
                    <button disabled={joiningChatId === chat.id} onClick={() => handleJoin(chat.id)} className="ui-button secondary ml-4 px-3 py-2 text-xs">
                       {joiningChatId === chat.id ? 'JOINING...' : 'JOIN'}
                    </button>
                 ) : (
                    <button onClick={() => onSelectChat(chat.id)} className="ui-button secondary ml-4 px-3 py-2 text-xs">Open</button>
                 )}
              </div>
            </div>
          ))
        )}
      </div>
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <form onSubmit={async (e) => {
             e.preventDefault();
             setCreating(true);
             const { data, error } = await supabase.rpc('create_group_chat', {
                chat_name: newChat.name.trim(),
                chat_description: newChat.description.trim() || null,
                make_discoverable: newChat.discoverable,
                chat_image_url: newChat.image.trim() || null,
                chat_banner_url: newChat.banner.trim() || null
             });
             if (!error) {
                const cid = readRpcChatId(data);
                if (cid) {
                   showToast({ title: 'Room Created', variant: 'success' });
                   setCreateOpen(false);
                   onSelectChat(cid);
                }
             } else {
                showToast({ title: 'Creation failed', description: error.message, variant: 'error' });
             }
             setCreating(false);
          }} className="surface-card w-full max-w-xl p-8 rounded-3xl shadow-2xl relative border border-[var(--accent)]/20">
            <button type="button" onClick={() => setCreateOpen(false)} className="absolute top-6 right-6 p-2 text-muted hover:text-primary transition"><X className="h-5 w-5" /></button>
            <div className="flex items-center gap-4 mb-6">
               <div className="h-12 w-12 bg-[var(--accent-soft)] rounded-xl flex items-center justify-center text-rainbow-blue shadow-md"><Users className="h-6 w-6" /></div>
               <div>
                  <h3 className="text-2xl font-semibold text-primary tracking-tight uppercase ">Create Community</h3>
                  <p className="text-muted text-xs font-medium">Build a new space for your members.</p>
               </div>
            </div>

            <div className="space-y-4">
              <Field label="Group Name" value={newChat.name} onChange={(v: string) => setNewChat({...newChat, name: v})} placeholder="e.g. Dragon Lounge" required />
              <Field label="Description" value={newChat.description} onChange={(v: string) => setNewChat({...newChat, description: v})} placeholder="What this group is for" />
              <div className="grid md:grid-cols-2 gap-4">
                 <Field label="Icon URL" value={newChat.image} onChange={(v: string) => setNewChat({...newChat, image: v})} placeholder="https://..." />
                 <Field label="Banner URL" value={newChat.banner} onChange={(v: string) => setNewChat({...newChat, banner: v})} placeholder="https://..." />
              </div>
              <ToggleRow label="Discoverable Room" description="Allow anyone to find and join." checked={newChat.discoverable} onChange={(v: boolean) => setNewChat({...newChat, discoverable: v})} />
            </div>

            <button type="submit" disabled={creating || !newChat.name.trim()} className="ui-button primary w-full py-4 mt-8 font-semibold text-lg shadow-lg uppercase  tracking-tight transition-all">
               {creating ? <Loader2 className="animate-spin h-5 w-5 mx-auto" /> : 'INITIALIZE'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function Header({ config }: any) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-rainbow-blue">
        <config.icon className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-primary">{config.title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{config.description}</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: any) {
   return (
      <div className="space-y-1.5">
         <label className="text-[10px] font-semibold uppercase text-muted tracking-wider px-1">{label}</label>
         <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className="form-input w-full font-semibold px-4 py-2.5 text-sm" />
      </div>
   );
}

function ToggleRow({ label, description, checked, onChange }: any) {
   return (
      <label className="flex items-center justify-between p-4 bg-[var(--surface-elevated)] rounded-xl border border-transparent hover:border-[var(--accent)]/10 transition-all cursor-pointer">
         <div className="min-w-0 flex-1 pr-4">
            <p className="font-semibold text-sm text-primary uppercase tracking-tight">{label}</p>
            <p className="text-[10px] text-muted mt-0.5 leading-relaxed font-semibold uppercase opacity-50 truncate">{description}</p>
         </div>
         <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-2 border-muted transition-all" />
      </label>
   );
}
