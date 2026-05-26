'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { Bot, Copy, Gavel, Link2, Loader2, Megaphone, MessageSquarePlus, Pin, Plus, RefreshCw, Save, Send, Settings, ShieldAlert, ShieldCheck, Star, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './ToastProvider';

type ProfileRole = 'user' | 'admin';
type MemberRole = 'owner' | 'admin' | 'member';

type CustomBot = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  is_pinned: boolean | null;
  is_broadcast: boolean | null;
  profiles: {
    display_name: string | null;
    username: string | null;
    role: ProfileRole | null;
  } | null;
};

type ChatInfo = {
  id: string;
  name: string | null;
  description: string | null;
  is_group: boolean;
  is_discoverable: boolean;
  image_url: string | null;
  banner_url: string | null;
  block_profanity: boolean | null;
  custom_blocked_words: string[] | null;
  managers_can_remove_members: boolean | null;
  managers_can_timeout_members: boolean | null;
  managers_can_ban_members: boolean | null;
  members_can_remove_members: boolean | null;
  members_can_ban_members: boolean | null;
  bots_enabled: boolean | null;
  enabled_bots: string[] | null;
  custom_bots: CustomBot[] | null;
  created_by: string | null;
  invite_code: string | null;
  invite_enabled: boolean | null;
  announcement: string | null;
  announcement_updated_at: string | null;
};

type ChatMember = {
  chat_id: string;
  user_id: string;
  role: MemberRole;
  profiles: {
    display_name: string | null;
    username: string | null;
    role: ProfileRole | null;
  } | null;
  banned?: boolean | null;
  admin_alert?: string | null;
};

type RawMessage = Omit<Message, 'profiles'> & {
  profiles:
    | {
        display_name: string | null;
        username: string | null;
        role: ProfileRole | null;
      }
    | {
        display_name: string | null;
        username: string | null;
        role: ProfileRole | null;
      }[]
    | null;
};

type RpcMember = {
  chat_id: string;
  user_id: string;
  member_role: MemberRole;
  joined_at: string;
  username: string | null;
  display_name: string | null;
  platform_role: ProfileRole | null;
  banned: boolean | null;
  admin_alert: string | null;
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

export default function ChatRoom({ chatId, onOpenChat }: { chatId: string; onOpenChat?: (id: string) => void }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteAttempted, setInviteAttempted] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);

  const currentMember = members.find((member) => member.user_id === profile?.id);
  const canManageChat = Boolean(profile?.role === 'admin' || chatInfo?.created_by === profile?.id || currentMember?.role === 'owner' || currentMember?.role === 'admin');
  const parentalHold = Boolean(profile?.age && profile.age < 13 && !profile.parent_approved);

  const fetchChat = useCallback(async () => {
    const { data, error } = await supabase
      .from('chats')
      .select(
        'id, name, description, is_group, is_discoverable, image_url, banner_url, block_profanity, custom_blocked_words, managers_can_remove_members, managers_can_timeout_members, managers_can_ban_members, members_can_remove_members, members_can_ban_members, bots_enabled, enabled_bots, custom_bots, created_by, invite_code, invite_enabled, announcement, announcement_updated_at',
      )
      .eq('id', chatId)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
    } else if (!data) {
      setLoadError('This chat could not be found or you do not have access to it.');
    } else {
      setChatInfo(data as ChatInfo);
    }
  }, [chatId, supabase]);

  const joinFromInviteIfPresent = useCallback(async () => {
    if (inviteAttempted) return;
    const searchInvite = new URLSearchParams(window.location.search).get('invite');
    const hashInvite = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('invite');
    const invite = searchInvite || hashInvite;
    if (!invite) return;

    setInviteAttempted(true);
    const { error } = await supabase.rpc('join_chat_with_invite', {
      target_chat_id: chatId,
      target_invite_code: invite,
    });

    if (error) {
      showToast({ title: 'Invite failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'Joined chat', variant: 'success' });
    }
  }, [chatId, inviteAttempted, showToast, supabase]);

  const fetchMembers = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_chat_members', { target_chat_id: chatId });

    if (error) {
      setLoadError(error.message);
      return;
    }

    const rows = (data ?? []) as unknown as RpcMember[];
    setMembers(
      rows.map((row) => ({
        chat_id: row.chat_id,
        user_id: row.user_id,
        role: row.member_role,
        profiles: {
          display_name: row.display_name,
          username: row.username,
          role: row.platform_role,
        },
        banned: row.banned,
        admin_alert: row.admin_alert,
      })),
    );
  }, [chatId, supabase]);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, created_at, sender_id, is_pinned, is_broadcast, profiles(display_name, username, role)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      setLoadError(error.message);
      return;
    }

    const rows = (data ?? []) as unknown as RawMessage[];
    setMessages(
      rows.map((row) => ({
        ...row,
        profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
      })),
    );
  }, [chatId, supabase]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      await joinFromInviteIfPresent();
      await Promise.all([fetchChat(), fetchMembers(), fetchMessages()]);
      if (active) setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`chat:${chatId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, () => {
        fetchMessages();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${chatId}` }, () => {
        fetchMembers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` }, () => {
        fetchChat();
      })
      .on('broadcast', { event: 'message-sent' }, () => {
        fetchMessages();
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const userId = String(payload.userId ?? '');
        const name = String(payload.name ?? 'Someone');
        const typing = Boolean(payload.typing);

        if (!userId || userId === profile?.id) return;

        setTypingUsers((items) => {
          const next = { ...items };
          if (typing) next[userId] = name;
          else delete next[userId];
          return next;
        });

        if (typing) {
          window.setTimeout(() => {
            setTypingUsers((items) => {
              const next = { ...items };
              delete next[userId];
              return next;
            });
          }, 3500);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      active = false;
      channelRef.current = null;
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [chatId, fetchChat, fetchMembers, fetchMessages, joinFromInviteIfPresent, profile?.id, supabase]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const sendTyping = (typing: boolean) => {
    if (!profile || !channelRef.current) return;
    if (typing) {
      const now = Date.now();
      if (now - lastTypingSentRef.current < 1100) return;
      lastTypingSentRef.current = now;
    }

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: profile.id,
        name: profile.display_name || profile.username,
        typing,
      },
    });
  };

  const handleMessageChange = (value: string) => {
    setNewMessage(value);
    if (!value.trim()) {
      sendTyping(false);
      return;
    }

    sendTyping(true);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => sendTyping(false), 1600);
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newMessage.trim() || !profile || !chatInfo || sending) return;

    if (profile.banned) {
      showToast({
        title: 'Account banned',
        description: profile.ban_reason || 'A platform admin has restricted this account.',
        variant: 'error',
      });
      return;
    }

    if (parentalHold) {
      showToast({
        title: 'Messages are paused',
        description: 'This account is waiting for parental approval.',
        variant: 'error',
      });
      return;
    }

    const content = newMessage.trim();
    if (chatInfo.block_profanity) {
      const builtInBlocked = ['fuck', 'shit', 'bitch', 'asshole', 'damn'];
      const blocked = [...builtInBlocked, ...(chatInfo.custom_blocked_words ?? [])]
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);
      const normalizedContent = content.toLowerCase();

      if (blocked.some((word) => normalizedContent.includes(word))) {
        showToast({
          title: 'Message blocked',
          description: 'This chat blocks that word.',
          variant: 'error',
        });
        return;
      }
    }

    setSending(true);
    setNewMessage('');
    sendTyping(false);

    const { error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: profile.id,
      content,
    });

    if (error) {
      setNewMessage(content);
      showToast({
        title: 'Message failed',
        description: error.message,
        variant: 'error',
      });
    } else {
      await fetchMessages();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'message-sent',
        payload: { chatId },
      });
    }

    setSending(false);
  };

  const copyChatLink = async () => {
    const code = chatInfo?.invite_enabled && chatInfo.invite_code ? `&invite=${encodeURIComponent(chatInfo.invite_code)}` : '';
    const link = `${window.location.origin}/#chat=${encodeURIComponent(chatId)}${code}`;
    await navigator.clipboard.writeText(link);
    showToast({ title: 'Chat link copied', variant: 'success' });
  };

  const pinMessage = async (message: Message) => {
    if (!canManageChat) return;

    const { error } = await supabase.rpc('pin_message', {
      target_message_id: message.id,
      pinned_value: !message.is_pinned,
    });

    if (error) {
      showToast({ title: 'Pin failed', description: error.message, variant: 'error' });
    } else {
      await fetchMessages();
      showToast({ title: message.is_pinned ? 'Message unpinned' : 'Message pinned', variant: 'success' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading chat
      </div>
    );
  }

  if (loadError || !chatInfo) {
    return (
      <div className="app-panel flex flex-1 items-center justify-center p-8 text-center">
        <div className="surface-card max-w-md p-8">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-400" />
          <h2 className="mt-4 text-lg font-semibold text-primary">Chat unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{loadError}</p>
        </div>
      </div>
    );
  }

  const typingNames = Object.values(typingUsers);
  const pinnedMessages = messages.filter((message) => message.is_pinned);

  if (settingsOpen) {
    return (
      <ChatSettings
        chat={chatInfo}
        members={members}
        canManage={canManageChat}
        onInviteChanged={fetchChat}
        onClose={() => setSettingsOpen(false)}
        onMembersChanged={fetchMembers}
        onChatChanged={fetchChat}
        onOpenChat={onOpenChat}
        onMessagesChanged={fetchMessages}
      />
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
        {chatInfo.banner_url && chatInfo.is_group && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chatInfo.banner_url} alt="" className="h-24 w-full object-cover" />
        )}
        <div className="flex min-h-16 items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-bold text-rainbow-blue">
            {chatInfo.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={chatInfo.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (chatInfo.name || 'R')[0]
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-primary">{chatInfo.name || 'Untitled chat'}</h2>
            <p className="text-xs text-muted">
              {chatInfo.is_discoverable ? 'Public room' : chatInfo.is_group ? 'Private group' : 'Direct message'}
            </p>
            {chatInfo.description && <p className="mt-0.5 max-w-xl truncate text-xs text-muted">{chatInfo.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyChatLink} className="ui-button secondary px-3 py-2 text-sm">
            <Copy className="h-4 w-4" />
            Link
          </button>
          {canManageChat && (
            <button type="button" onClick={() => setSettingsOpen(true)} className="ui-button secondary px-3 py-2 text-sm">
              <Settings className="h-4 w-4" />
              Chat settings
            </button>
          )}
        </div>
        </div>
      </header>

      {parentalHold && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 text-sm text-amber-600 dark:text-amber-100">
          This account is waiting for parental approval, so sending messages is disabled.
        </div>
      )}

      {profile?.admin_alert && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-medium text-red-500">
          Platform alert: {profile.admin_alert}
        </div>
      )}

      {(chatInfo.announcement || pinnedMessages.length > 0) && (
        <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3">
          {chatInfo.announcement && (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-primary">
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-rainbow-blue" />
              <p className="min-w-0 break-words">{chatInfo.announcement}</p>
            </div>
          )}
          {pinnedMessages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {pinnedMessages.slice(0, 3).map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                  className="inline-flex max-w-sm items-center gap-2 rounded-full bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-bold text-primary"
                >
                  <Pin className="h-3.5 w-3.5 text-rainbow-blue" />
                  <span className="truncate">{message.content}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No messages yet.</div>
        ) : (
          messages.map((message) => {
            const member = members.find((item) => item.user_id === message.sender_id);
            const isMine = message.sender_id === profile?.id;
            const displayName = message.profiles?.display_name || message.profiles?.username || 'Unknown user';
            const platformAdmin = message.profiles?.role === 'admin';

            return (
              <div id={`message-${message.id}`} key={message.id} className={`flex gap-4 ${isMine ? 'flex-row-reverse' : ''}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-elevated)] font-bold uppercase text-muted">
                  {displayName[0]}
                </div>
                <div className={`flex max-w-[70%] flex-col space-y-1 ${isMine ? 'items-end text-right' : 'items-start'}`}>
                  <div className={`flex flex-wrap items-center gap-2 ${isMine ? 'justify-end' : ''}`}>
                    {message.is_broadcast && <Megaphone className="h-4 w-4 text-rainbow-blue" />}
                    <NameWithRole name={displayName} platformAdmin={platformAdmin} memberRole={member?.role} />
                    <span className="font-mono text-[10px] text-muted">{format(new Date(message.created_at), 'HH:mm')}</span>
                    {message.is_pinned && <Pin className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />}
                  </div>
                  <div className="group flex items-end gap-2">
                    <div
                      className={`message-bubble inline-block w-fit max-w-full break-words rounded-xl px-3 py-2 text-sm leading-6 ${
                        message.is_broadcast
                          ? 'border border-[var(--accent)] bg-[var(--accent-soft)] text-primary'
                          : isMine
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--surface-elevated)] text-primary'
                    }`}
                    >
                      {message.content}
                    </div>
                    {canManageChat && (
                      <button
                        type="button"
                        onClick={() => pinMessage(message)}
                        aria-label={message.is_pinned ? 'Unpin message' : 'Pin message'}
                        className="rounded-md p-1 text-muted opacity-0 transition hover:bg-[var(--surface-elevated)] hover:text-primary group-hover:opacity-100"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={sendMessage} className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-6">
        {typingNames.length > 0 && (
          <p className="mb-2 h-5 text-xs font-medium text-muted">
            {typingNames.slice(0, 2).join(', ')}
            {typingNames.length > 2 ? ` and ${typingNames.length - 2} more` : ''} {typingNames.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}
        <div className="relative">
          <input
            type="text"
            className="form-input w-full px-5 py-4 pr-14 disabled:opacity-60"
            placeholder={parentalHold ? 'Parental approval required' : 'Type a message...'}
            value={newMessage}
            onChange={(event) => handleMessageChange(event.target.value)}
            disabled={parentalHold || sending}
          />
          <button
            type="submit"
            disabled={parentalHold || sending || !newMessage.trim()}
            aria-label="Send message"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--accent)] p-2 text-white shadow-lg shadow-sky-950/20 transition hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </form>

    </div>
  );
}

function NameWithRole({
  name,
  platformAdmin,
  memberRole,
}: {
  name: string;
  platformAdmin: boolean;
  memberRole?: MemberRole;
}) {
  if (platformAdmin) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Star className="h-4 w-4 fill-yellow-300 text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.95)]" />
        <span className="rainbow-name text-sm font-black">{name}</span>
        <span className="platform-admin-badge">Platform Admin</span>
      </span>
    );
  }

  if (memberRole === 'owner') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Gavel className="role-icon-owner h-4 w-4" />
        <span className="text-sm font-bold text-primary">{name}</span>
        <span className="chat-owner-badge">Chat Owner</span>
      </span>
    );
  }

  if (memberRole === 'admin') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 fill-amber-300/30 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]" />
        <span className="text-sm font-bold text-primary">{name}</span>
        <span className="chat-admin-badge">Chat Admin</span>
      </span>
    );
  }

  return <span className="text-sm font-bold text-primary">{name}</span>;
}

function ChatSettings({
  chat,
  members,
  canManage,
  onClose,
  onMembersChanged,
  onInviteChanged,
  onChatChanged,
  onOpenChat,
  onMessagesChanged,
}: {
  chat: ChatInfo;
  members: ChatMember[];
  canManage: boolean;
  onClose: () => void;
  onMembersChanged: () => Promise<void>;
  onInviteChanged: () => Promise<void>;
  onChatChanged: () => Promise<void>;
  onOpenChat?: (id: string) => void;
  onMessagesChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [chatName, setChatName] = useState(chat.name ?? '');
  const [description, setDescription] = useState(chat.description ?? '');
  const [imageUrl, setImageUrl] = useState(chat.image_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(chat.banner_url ?? '');
  const [discoverable, setDiscoverable] = useState(Boolean(chat.is_discoverable));
  const [blockProfanity, setBlockProfanity] = useState(Boolean(chat.block_profanity));
  const [blockedWords, setBlockedWords] = useState((chat.custom_blocked_words ?? []).join(', '));
  const [managersRemove, setManagersRemove] = useState(chat.managers_can_remove_members ?? true);
  const [managersTimeout, setManagersTimeout] = useState(chat.managers_can_timeout_members ?? true);
  const [managersBan, setManagersBan] = useState(Boolean(chat.managers_can_ban_members));
  const [membersRemove, setMembersRemove] = useState(Boolean(chat.members_can_remove_members));
  const [membersBan, setMembersBan] = useState(Boolean(chat.members_can_ban_members));
  const [botsEnabled, setBotsEnabled] = useState(Boolean(chat.bots_enabled));
  const [enabledBots, setEnabledBots] = useState<Set<string>>(new Set(chat.enabled_bots ?? []));
  const [customBots, setCustomBots] = useState<CustomBot[]>(chat.custom_bots ?? []);
  const [customBotDraft, setCustomBotDraft] = useState({ name: '', description: '', prompt: '' });
  const [broadcastText, setBroadcastText] = useState('');

  const setMemberRole = async (member: ChatMember, role: MemberRole) => {
    if (!canManage || member.role === 'owner') return;

    setSavingUserId(member.user_id);
    const { error } = await supabase.rpc('update_chat_member_role', {
      target_chat_id: chat.id,
      target_user_id: member.user_id,
      target_role: role,
    });

    if (error) {
      showToast({ title: 'Role update failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'Role updated', variant: 'success' });
      await onMembersChanged();
    }

    setSavingUserId(null);
  };

  const removeMember = async (member: ChatMember) => {
    if (!canManage || member.role === 'owner' || member.user_id === profile?.id) return;

    setSavingUserId(member.user_id);
    const { error } = await supabase.rpc('remove_chat_member', {
      target_chat_id: chat.id,
      target_user_id: member.user_id,
    });

    if (error) {
      showToast({ title: 'Remove failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'Member removed', variant: 'success' });
      await onMembersChanged();
    }

    setSavingUserId(null);
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteUsername.trim()) return;

    setBusyAction('add-member');
    const { error } = await supabase.rpc('add_chat_member_by_username', {
      target_chat_id: chat.id,
      target_username: inviteUsername.trim(),
      target_role: inviteRole,
    });

    if (error) {
      showToast({ title: 'Invite failed', description: error.message, variant: 'error' });
    } else {
      setInviteUsername('');
      setInviteRole('member');
      showToast({ title: 'Member added', variant: 'success' });
      await onMembersChanged();
    }

    setBusyAction(null);
  };

  const saveChatSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction('save-settings');
    const botList = Array.from(enabledBots);
    const wordList = blockedWords
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean);

    const { error } = await supabase.rpc('update_chat_full_settings', {
      target_chat_id: chat.id,
      chat_name: chatName.trim(),
      chat_description: description.trim() || null,
      chat_image_url: imageUrl.trim() || null,
      chat_banner_url: chat.is_group ? bannerUrl.trim() || null : null,
      make_discoverable: discoverable,
      block_words: blockProfanity,
      blocked_words: wordList,
      managers_remove: managersRemove,
      managers_timeout: managersTimeout,
      managers_ban: managersBan,
      members_remove: membersRemove,
      members_ban: membersBan,
      bots_on: botsEnabled,
      bot_list: botList,
      custom_bot_list: customBots,
    });

    if (error) {
      showToast({ title: 'Settings failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'Chat settings saved', variant: 'success' });
      await onChatChanged();
    }

    setBusyAction(null);
  };

  const startDm = async (member: ChatMember) => {
    const username = member.profiles?.username;
    if (!username || member.user_id === profile?.id) return;

    setSavingUserId(member.user_id);
    const { data, error } = await supabase.rpc('create_direct_message_by_username', { target_username: username });

    if (error) {
      showToast({ title: 'Could not start DM', description: error.message, variant: 'error' });
    } else {
      const dmChatId = readRpcChatId(data);
      if (dmChatId) {
        onClose();
        onOpenChat?.(dmChatId);
      }
    }

    setSavingUserId(null);
  };

  const copyInvite = async () => {
    const code = chat.invite_enabled && chat.invite_code ? `&invite=${encodeURIComponent(chat.invite_code)}` : '';
    const link = `${window.location.origin}/#chat=${encodeURIComponent(chat.id)}${code}`;
    await navigator.clipboard.writeText(link);
    showToast({ title: 'Invite link copied', variant: 'success' });
  };

  const regenerateInvite = async () => {
    setBusyAction('regen-invite');
    const { error } = await supabase.rpc('regenerate_chat_invite', { target_chat_id: chat.id });

    if (error) {
      showToast({ title: 'Invite reset failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'Invite link regenerated', variant: 'success' });
      await onInviteChanged();
    }

    setBusyAction(null);
  };

  const sendBroadcast = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!broadcastText.trim()) return;

    setBusyAction('broadcast');
    const { error } = await supabase.rpc('send_group_broadcast', {
      target_chat_id: chat.id,
      message_content: broadcastText.trim(),
    });

    if (error) {
      showToast({ title: 'Broadcast failed', description: error.message, variant: 'error' });
    } else {
      setBroadcastText('');
      showToast({ title: 'Broadcast sent', variant: 'success' });
      await Promise.all([onChatChanged(), onMessagesChanged()]);
    }

    setBusyAction(null);
  };

  const addCustomBot = () => {
    if (!customBotDraft.name.trim() || !customBotDraft.prompt.trim()) return;

    setCustomBots((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        name: customBotDraft.name.trim(),
        description: customBotDraft.description.trim(),
        prompt: customBotDraft.prompt.trim(),
        enabled: true,
      },
    ]);
    setCustomBotDraft({ name: '', description: '', prompt: '' });
  };

  const updateCustomBot = (id: string, nextValues: Partial<CustomBot>) => {
    setCustomBots((items) => items.map((bot) => (bot.id === id ? { ...bot, ...nextValues } : bot)));
  };

  return (
    <div className="app-panel flex h-screen flex-1 overflow-hidden">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-sidebar p-4 lg:block">
        <button type="button" onClick={onClose} className="ui-button secondary mb-5 w-full px-3 py-2 text-sm">
          <X className="h-4 w-4" />
          Back to chat
        </button>
        <nav className="space-y-1 text-sm font-semibold text-muted">
          {['Overview', 'Invites', 'Members', 'Safety', 'Permissions', 'Bots'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => document.getElementById(item.toLowerCase())?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-elevated)] hover:text-primary"
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-primary">Chat settings</h2>
              <p className="mt-1 text-sm text-muted">{chat.name || 'Untitled chat'}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close chat settings" className="ui-button secondary h-9 w-9 p-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          <form id="overview" onSubmit={saveChatSettings} className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
            <section className="surface-card p-5">
              <SectionHeader title="Overview" description="Set the identity people see before they join or open this chat." />
              <div className="mt-4 grid gap-3">
                <LabeledInput label="Chat name" value={chatName} onChange={setChatName} placeholder="Chat name" />
                <LabeledTextarea label="Description" value={description} onChange={setDescription} placeholder="What is this chat for?" />
                <div className="grid gap-3 md:grid-cols-2">
                  <LabeledInput label="Chat image URL" value={imageUrl} onChange={setImageUrl} placeholder="https://example.com/icon.png" />
                  {chat.is_group && <LabeledInput label="Banner URL" value={bannerUrl} onChange={setBannerUrl} placeholder="https://example.com/banner.png" />}
                </div>
                <ToggleRow label="Discoverable" description="Show this group in Discover." checked={discoverable} onChange={setDiscoverable} />
              </div>
            </section>

            <section id="safety" className="surface-card p-5">
              <SectionHeader title="Safety" description="Stop obvious junk before it hits the room." />
              <div className="mt-4 grid gap-3">
                <ToggleRow label="Block profanity" description="Block messages containing common or custom blocked words." checked={blockProfanity} onChange={setBlockProfanity} />
                <LabeledTextarea label="Custom blocked words" value={blockedWords} onChange={setBlockedWords} placeholder="comma, separated, words" />
              </div>
            </section>

            <section id="permissions" className="surface-card p-5">
              <SectionHeader title="Permissions" description="Control what managers and regular members can do." />
              <div className="mt-4 grid gap-3">
                <ToggleRow label="Managers can remove members" checked={managersRemove} onChange={setManagersRemove} />
                <ToggleRow label="Managers can time out members" checked={managersTimeout} onChange={setManagersTimeout} />
                <ToggleRow label="Managers can ban members" checked={managersBan} onChange={setManagersBan} />
                <ToggleRow label="Members can remove members" checked={membersRemove} onChange={setMembersRemove} />
                <ToggleRow label="Members can ban members" checked={membersBan} onChange={setMembersBan} />
              </div>
            </section>

            <section id="bots" className="surface-card p-5">
              <SectionHeader title="Bots" description="Enable built-in helpers or define custom bots for this group." icon={Bot} />
              <div className="mt-4 grid gap-3">
                <ToggleRow label="Enable bots" checked={botsEnabled} onChange={setBotsEnabled} />
                <div className="grid gap-2 sm:grid-cols-3">
                  {['Raigon helper', 'Welcome guard', 'Profanity monitor'].map((bot) => (
                    <button
                      key={bot}
                      type="button"
                      onClick={() => {
                        setEnabledBots((items) => {
                          const next = new Set(items);
                          if (next.has(bot)) next.delete(bot);
                          else next.add(bot);
                          return next;
                        });
                      }}
                      className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${
                        enabledBots.has(bot)
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-primary'
                          : 'border-[var(--border)] bg-[var(--surface-elevated)] text-muted hover:text-primary'
                      }`}
                    >
                      {bot}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                  <p className="text-sm font-bold text-primary">Custom bot</p>
                  <div className="mt-3 grid gap-3">
                    <LabeledInput
                      label="Bot name"
                      value={customBotDraft.name}
                      onChange={(value) => setCustomBotDraft((draft) => ({ ...draft, name: value }))}
                      placeholder="Welcome Sage"
                    />
                    <LabeledInput
                      label="Short description"
                      value={customBotDraft.description}
                      onChange={(value) => setCustomBotDraft((draft) => ({ ...draft, description: value }))}
                      placeholder="Greets new members and answers room questions"
                    />
                    <LabeledTextarea
                      label="Behavior prompt"
                      value={customBotDraft.prompt}
                      onChange={(value) => setCustomBotDraft((draft) => ({ ...draft, prompt: value }))}
                      placeholder="Tell this bot how it should behave in this chat."
                    />
                    <button type="button" onClick={addCustomBot} disabled={!customBotDraft.name.trim() || !customBotDraft.prompt.trim()} className="ui-button secondary px-3 py-2 text-sm">
                      <Plus className="h-4 w-4" />
                      Add custom bot
                    </button>
                  </div>
                </div>

                {customBots.length > 0 && (
                  <div className="grid gap-2">
                    {customBots.map((bot) => (
                      <div key={bot.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-primary">{bot.name}</p>
                            <p className="mt-1 text-xs text-muted">{bot.description || 'Custom bot'}</p>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-bold text-muted">
                            Enabled
                            <input type="checkbox" checked={bot.enabled} onChange={(event) => updateCustomBot(bot.id, { enabled: event.target.checked })} />
                          </label>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{bot.prompt}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="xl:col-span-2">
              <button type="submit" disabled={busyAction === 'save-settings'} className="ui-button primary w-full py-3">
                {busyAction === 'save-settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save settings
              </button>
            </div>
          </form>

        <form onSubmit={sendBroadcast} className="surface-card mt-6 p-5">
          <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
            <Megaphone className="h-5 w-5 text-rainbow-blue" />
            Broadcast
          </h3>
          <p className="mt-1 text-sm text-muted">Send a highlighted groupwide message and show it as the current announcement.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={broadcastText}
              onChange={(event) => setBroadcastText(event.target.value)}
              placeholder="Write a groupwide update..."
              className="form-input px-3 py-2 text-sm"
            />
            <button type="submit" disabled={busyAction === 'broadcast' || !broadcastText.trim()} className="ui-button primary px-3 py-2 text-sm">
              {busyAction === 'broadcast' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Send
            </button>
          </div>
        </form>

        <section id="invites" className="surface-card mt-6 p-5">
          <h3 className="text-lg font-bold text-primary">Invite link</h3>
          <p className="mt-1 text-sm text-muted">Use this for public or private chats. Private chats require the invite token.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={copyInvite} className="ui-button primary px-3 py-2 text-sm">
              <Link2 className="h-4 w-4" />
              Copy invite
            </button>
            <button type="button" onClick={regenerateInvite} disabled={busyAction === 'regen-invite'} className="ui-button secondary px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" />
              {busyAction === 'regen-invite' ? 'Resetting...' : 'Regenerate'}
            </button>
          </div>
        </section>

        <section className="surface-card mt-6 p-5">
          <h3 className="text-lg font-bold text-primary">Add member</h3>
          <p className="mt-1 text-sm text-muted">Add users by exact username. Owners can add managers; chat admins can add regular members.</p>
          <form onSubmit={addMember} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <input
              value={inviteUsername}
              onChange={(event) => setInviteUsername(event.target.value)}
              placeholder="username"
              className="form-input px-3 py-2 text-sm"
            />
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as MemberRole)} className="form-input px-3 py-2 text-sm">
              <option value="member">Member</option>
              <option value="admin">Chat admin</option>
            </select>
            <button type="submit" disabled={busyAction === 'add-member' || !inviteUsername.trim()} className="ui-button primary px-3 py-2 text-sm">
              <Plus className="h-4 w-4" />
              {busyAction === 'add-member' ? 'Adding...' : 'Add'}
            </button>
          </form>
        </section>

        <section id="members" className="surface-card mt-6 p-5">
          <h3 className="text-lg font-bold text-primary">Members and managers</h3>
          <p className="mt-1 text-sm text-muted">Manage every visible member in this chat. Platform admins override chat admins.</p>

          <div className="mt-5 space-y-3">
            {members.map((member) => {
              const displayName = member.profiles?.display_name || member.profiles?.username || 'Unknown user';
              const busy = savingUserId === member.user_id;
              const isPlatformAdmin = member.profiles?.role === 'admin';
              const locked = member.role === 'owner' || (isPlatformAdmin && profile?.role !== 'admin');

              return (
                <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-elevated)] p-3">
                  <div className="min-w-0">
                    <NameWithRole name={displayName} platformAdmin={member.profiles?.role === 'admin'} memberRole={member.role} />
                    <p className="mt-1 text-xs text-muted">
                      {member.banned ? 'Banned platform account' : member.admin_alert ? `Alert: ${member.admin_alert}` : member.user_id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={member.role}
                      disabled={locked || busy}
                      onChange={(event) => setMemberRole(member, event.target.value as MemberRole)}
                      className="form-input px-3 py-2 text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Chat admin</option>
                    </select>
                    <button
                      type="button"
                      disabled={locked || busy || member.user_id === profile?.id}
                      onClick={() => removeMember(member)}
                      className="ui-button secondary px-3 py-2 text-sm disabled:opacity-50"
                    >
                      {busy ? 'Working...' : 'Remove'}
                    </button>
                    <button
                      type="button"
                      disabled={busy || member.user_id === profile?.id}
                      onClick={() => startDm(member)}
                      className="ui-button secondary px-3 py-2 text-sm disabled:opacity-50"
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      DM
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: React.ElementType;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
        {Icon && <Icon className="h-5 w-5 text-rainbow-blue" />}
        {title}
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-semibold text-primary">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="form-input w-full px-3 py-2 text-sm" />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-semibold text-primary">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="form-input min-h-24 w-full resize-y px-3 py-2 text-sm"
      />
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
      <span>
        <span className="block text-sm font-bold text-primary">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
