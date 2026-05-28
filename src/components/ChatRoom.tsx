'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { AlertCircle, Bot, Copy, Flag, Gavel, History, Link2, Loader2, Megaphone, MessageSquarePlus, Paperclip, Pin, Plus, RefreshCw, Save, Send, Settings, ShieldAlert, ShieldCheck, Smile, Star, Trash2, X, Zap, MessageCircle, Boxes, Users, Lock, Download, FileText, Image as ImageIcon, FileArchive, Eye, Check, Shield, UserMinus, ShieldX, UserCog, UserPlus, Hammer, ShieldAlert as ShieldIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { appUrl } from '@/lib/paths';
import { useToast } from './ToastProvider';
import ConfirmDialog from './ConfirmDialog';
import CustomDropdown from './CustomDropdown';

type ProfileRole = 'user' | 'admin';
type MemberRole = 'owner' | 'admin' | 'member';

type CustomBot = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
};

type Reaction = {
  id: string;
  emoji: string;
  user_id: string;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  is_pinned: boolean | null;
  is_broadcast: boolean | null;
  bot_name?: string | null;
  reactions?: Reaction[];
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
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
  group_admins_can_delete_chat?: boolean | null;
  messages_per_minute_limit?: number | null;
  message_interval_seconds?: number | null;
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

const RoleBadge = ({ role, isOwner, memberRole }: { role?: string, isOwner?: boolean, memberRole?: string }) => {
  if (role === 'admin') return (
    <span className="platform-admin-badge ml-2 flex items-center gap-1.5 shrink-0">
       <Star className="h-4 w-4 fill-white text-white" />
       Platform Admin
    </span>
  );
  if (isOwner) return (
    <span className="chat-owner-badge ml-2 flex items-center gap-1.5 shrink-0">
       <Gavel className="h-4 w-4 fill-white text-white" />
       Owner
    </span>
  );
  if (memberRole === 'admin') return (
    <span className="chat-admin-badge ml-2 flex items-center gap-1.5 shrink-0">
       <ShieldCheck className="h-4 w-4 fill-white text-white" />
       Chat Admin
    </span>
  );
  return null;
};

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [reportingMessage, setReportingMessage] = useState<Message | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearAnnounceConfirm, setShowClearAnnounceConfirm] = useState(false);
  
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingZip, setViewingZip] = useState<Message | null>(null);
  
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [lastSentAt, setLastSentAt] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
       const file = e.clipboardData?.files[0];
       if (file) setAttachedFile(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const uploadFile = async (file: File) => {
     const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
     const path = `${chatId}/${Date.now()}_${cleanName}`;
     const { data, error } = await supabase.storage.from('chat-attachments').upload(path, file);
     if (error) throw error;
     const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path);
     return publicUrl;
  };

  const fetchChat = useCallback(async () => {
    const { data, error } = await supabase.from('chats').select('*').eq('id', chatId).maybeSingle();
    if (error) setLoadError(error.message);
    else if (!data) setLoadError('Chat not found.');
    else setChatInfo(data as ChatInfo);
  }, [chatId, supabase]);

  const fetchMembers = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_chat_members', { target_chat_id: chatId });
    if (!error) {
      const rows = (data ?? []) as RpcMember[];
      setMembers(rows.map(r => ({
        chat_id: r.chat_id,
        user_id: r.user_id,
        role: r.member_role,
        profiles: { display_name: r.display_name, username: r.username, role: r.platform_role },
        banned: r.banned,
        admin_alert: r.admin_alert
      })));
    }
  }, [chatId, supabase]);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, created_at, sender_id, is_pinned, is_broadcast, bot_name, file_url, file_name, file_type, file_size, profiles!sender_id(display_name, username, role), message_reactions(id, emoji, user_id)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      showToast({ title: 'Database Sync Error', description: error.message, variant: 'error' });
      return;
    }

    setMessages((data ?? []).map(row => ({
      ...row,
      profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
      reactions: row.message_reactions
    })) as Message[]);
  }, [chatId, supabase, showToast]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchChat(), fetchMembers(), fetchMessages()]);
      if (active) setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`room:${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, () => fetchMessages())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` }, () => fetchChat())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${chatId}` }, () => fetchMembers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => fetchMessages())
      .subscribe();

    return () => { 
      active = false;
      supabase.removeChannel(channel); 
    };
  }, [chatId, fetchChat, fetchMembers, fetchMessages, supabase]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
     if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
     }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !attachedFile) || !profile || !chatInfo || sending || cooldownRemaining > 0) return;

    const now = Date.now();
    const interval = (chatInfo.message_interval_seconds || 0) * 1000;
    if (now - lastSentAt < interval) {
       setCooldownRemaining(Math.ceil((interval - (now - lastSentAt)) / 1000));
       return;
    }

    if (profile.banned) {
      showToast({ title: 'Account restricted', description: profile.ban_reason || 'Access denied.', variant: 'error' });
      return;
    }

    setSending(true);
    let fileData = {};
    if (attachedFile) {
       setUploading(true);
       try {
          const url = await uploadFile(attachedFile);
          fileData = { file_url: url, file_name: attachedFile.name, file_type: attachedFile.type, file_size: attachedFile.size };
       } catch (err: any) {
          showToast({ title: 'Upload failed', description: err.message, variant: 'error' });
          setSending(false);
          setUploading(false);
          return;
       }
       setUploading(false);
    }

    const content = newMessage.trim();
    setNewMessage('');
    setAttachedFile(null);

    const { error } = await supabase.from('messages').insert({ chat_id: chatId, sender_id: profile.id, content, ...fileData });
    if (error) {
      setNewMessage(content);
      showToast({ title: 'Send failed', description: error.message, variant: 'error' });
    } else {
      setLastSentAt(Date.now());
      fetchMessages();
    }
    setSending(false);
  };

  const deleteMessage = async () => {
    if (!messageToDelete) return;
    const { error } = await supabase.rpc('delete_message', { target_message_id: messageToDelete.id });
    if (!error) {
       showToast({ title: 'Message redacted', variant: 'success' });
       fetchMessages();
       setMessageToDelete(null);
    }
  };

  const toggleReaction = async (mid: string, emoji: string) => {
     if (!profile) return;
     const existing = messages.find(m => m.id === mid)?.reactions?.find(r => r.emoji === emoji && r.user_id === profile.id);
     
     // Optimistic update
     setMessages(prev => prev.map(msg => {
        if (msg.id !== mid) return msg;
        const reactions = msg.reactions || [];
        if (existing) {
           return { ...msg, reactions: reactions.filter(r => r.user_id !== profile.id || r.emoji !== emoji) };
        } else {
           return { ...msg, reactions: [...reactions, { id: 'temp', emoji, user_id: profile.id }] };
        }
     }));

     if (existing) {
       await supabase.from('message_reactions').delete().eq('id', existing.id);
     } else {
       await supabase.from('message_reactions').insert({ message_id: mid, user_id: profile.id, emoji });
     }
     fetchMessages();
  };

  const clearAnnouncement = async () => {
    const { error } = await supabase.rpc('clear_chat_announcement', { target_chat_id: chatId });
    if (!error) {
      showToast({ title: 'Announcement purged', variant: 'success' });
      fetchChat();
    } else {
       showToast({ title: 'Failed to purge', description: error.message, variant: 'error' });
    }
    setShowClearAnnounceConfirm(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-muted/20" /></div>;
  if (loadError) return <div className="flex-1 flex items-center justify-center p-8 text-center"><p className="text-red-500 font-semibold uppercase text-xs">{loadError}</p></div>;

  if (settingsOpen) {
    return (
      <ChatSettings
        chat={chatInfo}
        members={members}
        canManage={Boolean(profile?.role === 'admin' || members.find(m => m.user_id === profile?.id)?.role !== 'member')}
        onClose={() => setSettingsOpen(false)}
        onChanged={() => { fetchChat(); fetchMembers(); }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col bg-background relative overflow-x-hidden animate-in fade-in duration-300">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center font-bold text-rainbow-blue uppercase shadow-sm shrink-0">{(chatInfo?.name || 'C')[0]}</div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-primary truncate max-w-[120px] md:max-w-md tracking-tight leading-tight">{chatInfo?.name}</h2>
            <p className="text-[10px] text-muted uppercase font-bold tracking-wider opacity-60">{chatInfo?.is_discoverable ? 'Network Hub' : 'Secure Protocol'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
           <button onClick={() => setSettingsOpen(true)} className="ui-button secondary h-9 px-6 flex items-center gap-2 text-xs font-bold uppercase transition"><Settings className="h-4 w-4" /> Config</button>
        </div>
      </header>

      {chatInfo?.announcement && (
        <div className="shrink-0 border-b border-sky-500/10 bg-sky-500/5 px-6 py-3 flex items-center justify-between animate-in slide-in-from-top duration-300">
           <div className="flex items-start gap-3 text-sky-400 flex-1 min-w-0 mr-4">
              <Megaphone className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-sm font-semibold leading-relaxed break-words">{chatInfo.announcement}</p>
           </div>
           {(profile?.role === 'admin' || members.find(m => m.user_id === profile?.id)?.role !== 'member') && (
              <button onClick={() => setShowClearAnnounceConfirm(true)} className="p-1.5 hover:bg-sky-500/10 rounded-lg text-sky-600 transition shrink-0">
                 <X className="h-4 w-4" />
              </button>
           )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 custom-scrollbar bg-[var(--background)]">
        {messages.map((m) => {
          const isMine = m.sender_id === profile?.id;
          const isBot = Boolean(m.bot_name);
          const displayName = isBot ? m.bot_name : (m.profiles?.display_name || m.profiles?.username || 'user');
          const isSys = m.is_broadcast && !m.sender_id;
          const member = members.find(mem => mem.user_id === m.sender_id);
          const isChatOwner = m.sender_id === chatInfo?.created_by || member?.role === 'owner';
          const isPlatAdmin = m.profiles?.role === 'admin';
          
          if (isSys) {
             return (
                <div key={m.id} className="flex justify-center py-2">
                   <div className="px-5 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[10px] font-bold text-muted uppercase tracking-widest opacity-80 shadow-sm">
                      {m.content}
                   </div>
                </div>
             );
          }

          return (
            <div key={m.id} className={`flex gap-4 group ${isMine ? 'flex-row-reverse' : ''}`}>
               <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center font-bold uppercase shadow-sm ${isBot ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' : 'bg-[var(--surface-elevated)] text-muted'}`}>
                  {isBot ? <Bot className="h-5 w-5" /> : displayName?.[0]}
               </div>
               <div className={`flex flex-col gap-1 max-w-[85%] ${isMine ? 'items-end' : ''}`}>
                  <div className="flex items-center gap-2.5 px-1">
                     <span className={`text-[13px] font-bold flex items-center ${isPlatAdmin ? 'rainbow-name' : 'text-primary'}`}>
                        {displayName}
                        {!isBot && <RoleBadge role={m.profiles?.role || undefined} isOwner={isChatOwner} memberRole={member?.role} />}
                     </span>
                     <span className="text-[10px] text-muted font-mono opacity-50">{format(new Date(m.created_at), 'HH:mm')}</span>
                  </div>
                  <div className="flex items-start gap-2.5 max-w-full">
                     <div className={`message-bubble p-4 rounded-xl text-sm leading-relaxed shadow-sm min-w-0 ${isMine ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-elevated)] text-primary border border-[var(--border)]'} ${!isBot && profile?.username && m.content.includes(`@${profile.username}`) ? 'ring-2 ring-yellow-400/50' : ''}`}>
                        <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere overflow-hidden">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                        {m.file_url && (
                           <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/10 p-2 shadow-inner">
                              {m.file_type?.startsWith('image/') ? (
                                 <img src={m.file_url} alt={m.file_name || ''} className="max-h-64 rounded-lg object-contain" />
                              ) : (
                                 <div className="flex items-center justify-between gap-4 p-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                       {m.file_name?.endsWith('.zip') ? <FileArchive className="h-4 w-4 text-sky-400" /> : <FileText className="h-4 w-4 text-sky-400" />}
                                       <span className="text-[10px] font-semibold truncate uppercase">{m.file_name}</span>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                       {m.file_name?.endsWith('.zip') && <button onClick={() => setViewingZip(m)} className="p-1.5 hover:bg-white/10 rounded transition-all"><Eye className="h-4 w-4" /></button>}
                                       <a href={m.file_url} download={m.file_name || ''} className="p-1.5 hover:bg-white/10 rounded transition-all"><Download className="h-4 w-4" /></a>
                                    </div>
                                 </div>
                              )}
                           </div>
                        )}
                     </div>
                     <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition duration-200 shrink-0">
                        {(isMine || profile?.role === 'admin') && <button onClick={() => setMessageToDelete(m)} className="p-1.5 hover:bg-red-500/10 text-muted hover:text-red-500 rounded transition-all"><Trash2 className="h-3.5 w-3.5" /></button>}
                        <button onClick={() => setReportingMessage(m)} className="p-1.5 hover:bg-amber-500/10 text-muted hover:text-amber-500 rounded transition-all"><Flag className="h-3.5 w-3.5" /></button>
                     </div>
                  </div>
                  <div className="mt-1 flex flex-col gap-1.5">
                     {m.reactions && m.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1.5 ${isMine ? 'justify-end' : ''}`}>
                           {['👍','❤️','🔥','😂','😮','😢','😡'].map(emoji => {
                              const reactions = m.reactions?.filter(r => r.emoji === emoji) || [];
                              if (reactions.length === 0) return null;
                              const hasMine = reactions.some(r => r.user_id === profile?.id);
                              return (
                                 <button key={emoji} onClick={() => toggleReaction(m.id, emoji)} className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition shadow-sm ${hasMine ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-primary' : 'bg-[var(--surface-elevated)] border-[var(--border)] hover:border-[var(--accent)]'}`}>
                                    {emoji} {reactions.length}
                                 </button>
                              );
                           })}
                        </div>
                     )}
                     <div className={`flex gap-1 p-1 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl shadow-md opacity-0 group-hover:opacity-100 transition-all w-fit ${isMine ? 'ml-auto' : ''}`}>
                        {['👍','❤️','🔥','😂','😮','😢','😡'].map(e => (
                           <button key={e} onClick={() => toggleReaction(m.id, e)} className="p-1.5 hover:bg-[var(--accent-soft)] rounded-lg transition-transform hover:scale-125 text-xs">{e}</button>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          );
        })}
      </div>

      <footer className="p-4 bg-[var(--surface)] border-t border-[var(--border)] shadow-md relative z-10">
         <div className="max-w-5xl mx-auto space-y-3">
            {attachedFile && (
               <div className="flex items-center gap-4 p-3 bg-[var(--surface-elevated)] rounded-xl animate-in slide-in-from-bottom-2 duration-300 border border-[var(--accent)]/10">
                  <div className="h-10 w-10 bg-sky-500/10 rounded-lg flex items-center justify-center text-sky-500">
                     <Paperclip className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                     <p className="text-xs font-semibold truncate">{attachedFile.name}</p>
                     <p className="text-[10px] text-muted">{(attachedFile.size / 1024).toFixed(1)} KB READY</p>
                  </div>
                  <button onClick={() => setAttachedFile(null)} className="p-1.5 hover:bg-red-500/10 text-muted hover:text-red-500 rounded-lg transition"><X className="h-4 w-4" /></button>
               </div>
            )}
            <form onSubmit={sendMessage} className="relative flex items-end gap-3">
               <div className="relative flex-1">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute left-3 bottom-3 h-8 w-8 flex items-center justify-center text-muted hover:text-primary transition bg-[var(--surface)] rounded-lg border border-[var(--border)] shadow-sm">
                     <Paperclip className="h-5 w-5" />
                  </button>
                  <textarea
                     value={newMessage}
                     onChange={e => setNewMessage(e.target.value)}
                     onKeyDown={handleKeyDown}
                     placeholder={cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s...` : "Type a message..."}
                     disabled={cooldownRemaining > 0}
                     className="form-input w-full pr-4 py-3.5 pl-16 text-sm shadow-inner transition bg-[var(--surface-elevated)] border-transparent focus:border-[var(--accent)] resize-none min-h-[48px] max-h-48 rounded-xl"
                     rows={1}
                  />
                  <input type="file" ref={fileInputRef} onChange={e => setAttachedFile(e.target.files?.[0] || null)} className="hidden" />
               </div>
               <button disabled={(!newMessage.trim() && !attachedFile) || cooldownRemaining > 0 || uploading} className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-lg disabled:opacity-50 transition active:scale-95">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
               </button>
            </form>
         </div>
      </footer>

      <ConfirmDialog open={Boolean(messageToDelete)} title="Delete Message?" description="This action will permanently remove the message for all users." onConfirm={deleteMessage} onCancel={() => setMessageToDelete(null)} />
      <ConfirmDialog open={showClearAnnounceConfirm} title="Purge Announcement?" description="This will remove the current broadcast from the room header." onConfirm={clearAnnouncement} onCancel={() => setShowClearAnnounceConfirm(false)} />
      
      {viewingZip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
           <div className="surface-card w-full max-w-lg p-8 rounded-xl shadow-2xl relative border border-sky-500/20">
              <button onClick={() => setViewingZip(null)} className="absolute top-6 right-6 p-2 text-muted hover:text-primary transition"><X className="h-6 w-6" /></button>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-3 uppercase tracking-tight"><FileArchive className="h-6 w-6 text-sky-500" /> ZIP Explorer</h3>
              <p className="text-[10px] text-muted uppercase tracking-[0.2em] mb-4 font-black">Archive: {viewingZip.file_name}</p>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-3 custom-scrollbar">
                 <div className="p-4 bg-[var(--surface-elevated)] rounded-xl flex items-center gap-4 border border-[var(--border)]">
                    <FileText className="h-5 w-5 text-muted opacity-50" />
                    <span className="text-xs font-bold uppercase tracking-wide">Metadata analysis in progress...</span>
                 </div>
                 <p className="text-[10px] text-muted italic text-center p-4 opacity-50 uppercase tracking-[0.3em] font-black">Extraction engine v1.4 pending</p>
              </div>
              <a href={viewingZip.file_url!} download={viewingZip.file_name!} className="ui-button primary w-full py-4 mt-8 font-black uppercase tracking-[0.3em] shadow-2xl shadow-sky-600/30 rounded-xl">DOWNLOAD ARCHIVE</a>
           </div>
        </div>
      )}
    </div>
  );
}

function ChatSettings({ chat, members, canManage, onClose, onChanged }: any) {
   const { profile } = useAuth();
   const [tab, setTab] = useState('general');
   const [busy, setBusy] = useState(false);
   const supabase = useMemo(() => createClient(), []);
   const { showToast } = useToast();

   const [name, setName] = useState(chat.name || '');
   const [desc, setDesc] = useState(chat.description || '');
   const [img, setImg] = useState(chat.image_url || '');
   const [banner, setBanner] = useState(chat.banner_url || '');
   const [discoverable, setDiscoverable] = useState(chat.is_discoverable);
   const [profanity, setBlockProfanity] = useState(chat.block_profanity);
   const [interval, setIntervalVal] = useState(chat.message_interval_seconds || 0);
   
   // Permissions
   const [mRem, setMRem] = useState(chat.managers_can_remove_members);
   const [mTime, setMTime] = useState(chat.managers_can_timeout_members);
   const [mBan, setMBan] = useState(chat.managers_can_ban_members);
   const [uRem, setURem] = useState(chat.members_can_remove_members);
   const [uBan, setUBan] = useState(chat.members_can_ban_members);
   const [botsOn, setBotsOn] = useState(chat.bots_enabled);

   const [inviteUsername, setInviteUsername] = useState('');
   
   const [showTransferConfirm, setShowTransferConfirm] = useState(false);
   const [pendingTransferId, setPendingTransferId] = useState<string | null>(null);
   const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

   const save = async () => {
      setBusy(true);
      const { error } = await supabase.from('chats').update({ 
         name, description: desc, image_url: img, banner_url: banner, 
         is_discoverable: discoverable, block_profanity: profanity,
         message_interval_seconds: interval, managers_can_remove_members: mRem,
         managers_can_timeout_members: mTime, managers_can_ban_members: mBan,
         members_can_remove_members: uRem, members_can_ban_members: uBan,
         bots_enabled: botsOn
      }).eq('id', chat.id);
      
      if (error) showToast({ title: 'Update failed', description: error.message, variant: 'error' });
      else {
         showToast({ title: 'Settings saved', variant: 'success' });
         onChanged();
      }
      setBusy(false);
   };

   const manageMember = async (uid: string, action: string) => {
      const { error } = await supabase.rpc('manage_chat_member', { target_chat_id: chat.id, target_user_id: uid, action_type: action });
      if (!error) {
         showToast({ title: 'Action executed', variant: 'success' });
         onChanged();
      } else {
         showToast({ title: 'Action failed', description: error.message, variant: 'error' });
      }
   };

   const transferOwnership = async (uid: string) => {
      setPendingTransferId(uid);
      setShowTransferConfirm(true);
   };

   const executeTransfer = async () => {
      if (!pendingTransferId) return;
      const { error } = await supabase.rpc('transfer_chat_ownership', { target_chat_id: chat.id, new_owner_id: pendingTransferId });
      if (!error) {
         showToast({ title: 'Root Control Transferred', variant: 'success' });
         onChanged();
         onClose();
      } else {
         showToast({ title: 'Transfer failed', description: error.message, variant: 'error' });
      }
      setShowTransferConfirm(false);
      setPendingTransferId(null);
   };

   const sendInvite = async () => {
      if (!inviteUsername.trim()) return;
      const { error } = await supabase.rpc('invite_to_chat_by_username', { target_chat_id: chat.id, target_username: inviteUsername.trim() });
      if (!error) {
         showToast({ title: 'Invite sent', variant: 'success' });
         setInviteUsername('');
         onChanged();
      } else {
         showToast({ title: 'Invite failed', description: error.message, variant: 'error' });
      }
   };

   const leaveChat = async () => {
      const { error } = await supabase.rpc('leave_chat', { target_chat_id: chat.id });
      if (!error) window.location.hash = 'home';
      else showToast({ title: 'Redaction failed', description: error.message, variant: 'error' });
   };

   const deleteChat = async () => {
      const { error } = await supabase.rpc('delete_chat', { target_chat_id: chat.id });
      if (!error) window.location.hash = 'home';
   };

   return (
      <div className="flex h-screen flex-1 bg-[var(--background)] animate-in slide-in-from-right duration-500 overflow-x-hidden">
         <aside className="w-60 border-r border-[var(--border)] bg-[var(--sidebar)] p-5 flex flex-col gap-2 shrink-0">
            <button onClick={onClose} className="ui-button secondary mb-6 flex items-center gap-2.5 font-bold text-xs uppercase tracking-wider rounded-lg"><X className="h-4 w-4" /> Back</button>
            <p className="text-[9px] font-black text-muted uppercase tracking-[0.2em] mb-2 px-2 opacity-50">Management</p>
            <NavBtn label="General" icon={Settings} active={tab === 'general'} onClick={() => setTab('general')} />
            <NavBtn label="Branding" icon={ImageIcon} active={tab === 'branding'} onClick={() => setTab('branding')} />
            <NavBtn label="Permissions" icon={ShieldCheck} active={tab === 'permissions'} onClick={() => setTab('permissions')} />
            <NavBtn label="Members" icon={Users} active={tab === 'members'} onClick={() => setTab('members')} />
            <NavBtn label="Safety" icon={ShieldAlert} active={tab === 'safety'} onClick={() => setTab('safety')} />
            <div className="mt-auto space-y-2 pt-6">
               <button onClick={leaveChat} className="ui-button secondary w-full text-amber-500 border-amber-500/20 hover:bg-amber-500/5 font-black uppercase text-[9px] tracking-widest py-3 rounded-lg">Leave Room</button>
               <NavBtn label="Danger Zone" icon={Trash2} active={tab === 'danger'} onClick={() => setTab('danger')} className="text-red-500 hover:bg-red-500/10" />
            </div>
         </aside>
         
         <main className="flex-1 overflow-y-auto overflow-x-hidden p-8 bg-[var(--background)]">
            <div className="max-w-3xl mx-auto">
               {tab === 'general' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <h2 className="text-3xl font-black text-primary tracking-tight uppercase">Room Identity</h2>
                     <div className="space-y-6">
                        <label className="block space-y-2">
                           <span className="text-[11px] font-black uppercase text-muted tracking-[0.2em] px-1">Display Name</span>
                           <input value={name} onChange={e => setName(e.target.value)} className="form-input w-full font-bold py-4 px-5" />
                        </label>
                        <label className="block space-y-2">
                           <span className="text-[11px] font-black uppercase text-muted tracking-[0.2em] px-1">Description</span>
                           <textarea value={desc} onChange={e => setDesc(e.target.value)} className="form-input w-full min-h-[140px] text-sm leading-relaxed p-5 font-semibold" />
                        </label>
                        <ToggleRow label="Discoverable Room" description="Allow anyone to find and join this room." checked={discoverable} onChange={setDiscoverable} />
                        <button onClick={save} disabled={busy || !canManage} className="ui-button primary px-10 py-4 font-black shadow-2xl tracking-[0.2em] uppercase rounded-xl">Save Identity</button>
                     </div>
                  </div>
               )}

               {tab === 'branding' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <h2 className="text-3xl font-black text-primary tracking-tight uppercase">Visuals</h2>
                     <div className="space-y-6">
                        <label className="block space-y-2">
                           <span className="text-[11px] font-black uppercase text-muted tracking-[0.2em] px-1">Icon URL</span>
                           <input value={img} onChange={e => setImg(e.target.value)} className="form-input w-full font-semibold py-4 px-5" placeholder="https://..." />
                        </label>
                        <label className="block space-y-2">
                           <span className="text-[11px] font-black uppercase text-muted tracking-[0.2em] px-1">Banner URL</span>
                           <input value={banner} onChange={e => setBanner(e.target.value)} className="form-input w-full font-semibold py-4 px-5" placeholder="https://..." />
                        </label>
                        <button onClick={save} disabled={busy || !canManage} className="ui-button primary px-10 py-4 font-black shadow-2xl tracking-[0.2em] uppercase rounded-xl">Update Branding</button>
                     </div>
                  </div>
               )}

               {tab === 'permissions' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <h2 className="text-3xl font-black text-primary tracking-tight uppercase">Authority Controls</h2>
                     <div className="space-y-6">
                        <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] px-1 border-b border-[var(--border)] pb-3 mb-6 opacity-40">Manager Overrides</p>
                        <ToggleRow label="Remove Members" description="Allow managers to kick people." checked={mRem} onChange={setMRem} />
                        <ToggleRow label="Timeout Members" description="Allow managers to silence people." checked={mTime} onChange={setMTime} />
                        <ToggleRow label="Ban Members" description="Allow managers to permanently exclude people." checked={mBan} onChange={setMBan} />
                        
                        <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] px-1 mt-10 border-b border-[var(--border)] pb-3 mb-6 opacity-40">Member Liberties</p>
                        <ToggleRow label="Anarchy Kick" description="Allow any member to kick others." checked={uRem} onChange={setURem} />
                        <ToggleRow label="Anarchy Ban" description="Allow any member to ban others." checked={uBan} onChange={setUBan} />

                        <button onClick={save} disabled={busy || !canManage} className="ui-button primary px-10 py-4 font-black shadow-2xl tracking-[0.2em] uppercase rounded-xl mt-6">Update Permissions</button>
                     </div>
                  </div>
               )}

               {tab === 'members' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                        <h2 className="text-3xl font-black text-primary tracking-tight uppercase">Room Members</h2>
                        {canManage && (
                           <div className="flex gap-3">
                              <input 
                                 value={inviteUsername}
                                 onChange={e => setInviteUsername(e.target.value)}
                                 placeholder="Username..."
                                 className="form-input text-sm w-56 font-bold px-4 py-2"
                              />
                              <button onClick={sendInvite} className="ui-button primary h-10 px-6 text-[10px] font-black uppercase flex items-center gap-2 shadow-xl rounded-lg"><UserPlus className="h-4 w-4" /> Invite</button>
                           </div>
                        )}
                     </div>
                     <div className="grid gap-3">
                        {members.map((m: any) => (
                           <div key={m.user_id} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex items-center justify-between group shadow-sm hover:border-[var(--accent)]/30 transition-all">
                              <div className="flex items-center gap-4">
                                 <div className="h-11 w-11 rounded-lg bg-[var(--surface-elevated)] flex items-center justify-center font-black text-muted uppercase shadow-inner">{(m.profiles?.display_name || m.profiles?.username || '?')[0]}</div>
                                 <div>
                                    <div className="flex items-center gap-2.5">
                                       <span className={m.platform_role === 'admin' ? 'rainbow-name text-sm font-black' : 'text-sm font-black text-primary'}>@{m.profiles?.username}</span>
                                       <RoleBadge role={m.profiles?.role} isOwner={m.user_id === chat.created_by || m.role === 'owner'} memberRole={m.role} />
                                    </div>
                                    <p className="text-[10px] text-muted font-black uppercase tracking-[0.15em] mt-0.5">{m.role}</p>
                                 </div>
                              </div>
                              {canManage && m.user_id !== profile?.id && m.user_id !== chat.created_by && (
                                 <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition duration-200">
                                    {m.role === 'member' && <button onClick={() => manageMember(m.user_id, 'promote')} className="p-2 hover:bg-sky-500/10 rounded-lg text-muted hover:text-sky-500 transition-all" title="Promote to Admin"><ShieldCheck className="h-4 w-4" /></button>}
                                    {m.role === 'admin' && <button onClick={() => manageMember(m.user_id, 'demote')} className="p-2 hover:bg-amber-500/10 rounded-lg text-muted hover:text-amber-500 transition-all" title="Demote to Member"><ShieldX className="h-4 w-4" /></button>}
                                    {(profile?.role === 'admin' || (profile?.id === chat.created_by)) && (
                                       <button onClick={() => transferOwnership(m.user_id)} className="p-2 hover:bg-sky-500/10 rounded-lg text-muted hover:text-sky-400 transition-all" title="Transfer Ownership"><UserPlus className="h-4 w-4" /></button>
                                    )}
                                    <button onClick={() => manageMember(m.user_id, 'kick')} className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition-all" title="Kick Member"><UserMinus className="h-4 w-4" /></button>
                                 </div>
                              )}
                           </div>
                        ))}
                     </div>
                  </div>
               )}

               {tab === 'safety' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <h2 className="text-3xl font-black text-primary tracking-tight uppercase">Room Safety</h2>
                     <div className="space-y-6">
                        <div className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
                           <div className="flex items-center gap-3 text-sky-500 mb-6">
                              <History className="h-6 w-6" />
                              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Slow Mode Protocol</span>
                           </div>
                           <CustomDropdown 
                             label="Message Interval" 
                             value={interval.toString()} 
                             onChange={(v) => setIntervalVal(parseInt(v))} 
                             options={[
                               {v:'0', l:'Disabled (Real-time)'},
                               {v:'5', l:'5 Seconds'},
                               {v:'15', l:'15 Seconds'},
                               {v:'30', l:'30 Seconds'},
                               {v:'60', l:'1 Minute'}
                             ]} 
                           />
                        </div>
                        <ToggleRow label="Enforce Profanity Filter" description="Automatically block messages containing restricted keywords." checked={profanity} onChange={setBlockProfanity} />
                        <button onClick={save} disabled={busy || !canManage} className="ui-button primary px-10 py-4 font-black shadow-2xl tracking-[0.2em] uppercase rounded-xl">Apply Safety Rules</button>
                     </div>
                  </div>
               )}

               {tab === 'danger' && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                     <h2 className="text-3xl font-black text-red-500 tracking-tight uppercase">Danger Zone</h2>
                     <div className="p-8 border-2 border-red-500/20 bg-red-500/5 rounded-xl space-y-6 shadow-inner">
                        <p className="text-sm text-muted leading-relaxed font-bold">Terminating this room will permanently purge all history and members. This action cannot be reversed.</p>
                        <button onClick={() => setShowDeleteConfirm(true)} disabled={!canManage} className="ui-button bg-red-600 text-white px-8 py-4 font-black shadow-2xl hover:bg-red-500 transition-all uppercase text-[10px] tracking-[0.3em] rounded-xl">Terminate Room</button>
                     </div>
                  </div>
               )}
            </div>
         </main>
         
         <ConfirmDialog 
            open={showTransferConfirm} 
            title="Transfer Control?" 
            description="WARNING: TRANSFER ROOT CONTROL? THIS IS IRREVERSIBLE." 
            onConfirm={executeTransfer} 
            onCancel={() => { setShowTransferConfirm(false); setPendingTransferId(null); }} 
         />
         <ConfirmDialog 
            open={showDeleteConfirm} 
            title="Delete Group?" 
            description="IRREVERSIBLE: Delete this group and all its data?" 
            onConfirm={deleteChat} 
            onCancel={() => setShowDeleteConfirm(false)} 
         />
      </div>
   );
}

function NavBtn({ label, icon: Icon, active, onClick, className }: any) {
   return (
      <button onClick={onClick} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition duration-200 ${active ? 'bg-[var(--accent)] text-white shadow-md translate-x-1.5' : 'text-muted hover:bg-[var(--surface-elevated)] hover:text-primary'} ${className}`}>
         <Icon className={`h-4 w-4 ${active ? 'animate-pulse' : ''}`} />
         {label}
      </button>
   );
}

function ToggleRow({ label, description, checked, onChange }: any) {
   return (
      <label className="flex items-center justify-between p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] transition-all cursor-pointer hover:border-[var(--accent)]/30 group">
         <div className="min-w-0 flex-1 pr-4">
            <p className="font-bold text-sm text-primary uppercase tracking-tight">{label}</p>
            <p className="text-xs text-muted mt-1 leading-relaxed font-semibold uppercase opacity-60 group-hover:opacity-100 transition-opacity">{description}</p>
         </div>
         <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 rounded border-2 border-muted transition-all accent-[var(--accent)] cursor-pointer" />
      </label>
   );
}
