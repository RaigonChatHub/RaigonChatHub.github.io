'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  Bot,
  Bug,
  CheckCircle2,
  Database,
  Flag,
  Gavel,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  User,
  UserPlus,
  X,
  Plus,
  Mail,
  ExternalLink,
  MessageCircle,
  Clock
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { format } from 'date-fns';
import CustomDropdown from './CustomDropdown';

type UserProfile = {
  id: string;
  username: string;
  display_name: string | null;
  age: number | null;
  parent_approved: boolean;
  role: 'user' | 'admin' | 'owner';
  banned: boolean | null;
  ban_reason: string | null;
  admin_alert: string | null;
  ban_expires_at: string | null;
  is_warning: boolean;
};

type ReportDetails = {
  report_id: string;
  reporter_username: string;
  reporter_email: string;
  report_type: 'bug' | 'message';
  report_content: string;
  target_message_id: string | null;
  status: string;
  created_at: string;
  chat_id: string | null;
  context_messages: any[] | null;
};

type UpdateLog = {
  id: string;
  version: string;
  title: string;
  content: string;
  created_at: string;
};

function readContextMessages(value: unknown): any[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeReports(value: unknown): ReportDetails[] {
  if (!Array.isArray(value)) return [];

  return value.map((report: any) => ({
    report_id: report.report_id ?? report.id,
    reporter_username: report.reporter_username ?? (Array.isArray(report.profiles) ? report.profiles[0]?.username : report.profiles?.username) ?? 'unknown',
    reporter_email: report.reporter_email ?? 'Unavailable',
    report_type: report.report_type ?? report.type,
    report_content: report.report_content ?? report.content,
    target_message_id: report.target_message_id ?? null,
    status: report.status ?? 'pending',
    created_at: report.created_at,
    chat_id: report.chat_id ?? null,
    context_messages: readContextMessages(report.context_messages),
  }));
}

type AdminSettings = {
  admins_can_ban_users: boolean;
  admins_can_delete_platform_admins: boolean;
  admins_can_promote_admins: boolean;
  admins_can_manage_updates: boolean;
};

function roleLabel(role: UserProfile['role']) {
  if (role === 'owner') return 'Platform Owner';
  if (role === 'admin') return 'Platform Admin';
  return 'User';
}

export default function AdminDashboard({ section, onNavigate }: { section?: string; onNavigate?: (view: any) => void }) {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [reports, setReports] = useState<ReportDetails[]>([]);
  const [updates, setUpdates] = useState<UpdateLog[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [query, setQuery] = useState('');
  const [modTarget, setModTarget] = useState<UserProfile | null>(null);
  const [modAction, setModAction] = useState<'ban' | 'warn' | 'terminate' | 'unban'>('warn');
  const [modReason, setModReason] = useState('');
  const [modDuration, setModDuration] = useState('7'); // days
  const [busy, setBusy] = useState(false);

  const [newUpdate, setNewUpdate] = useState({ version: '', title: '', content: '' });
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [viewingContext, setViewingContext] = useState<ReportDetails | null>(null);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [newOwnerId, setNewOwnerId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: u, error: usersError },
        { data: c, error: chatsError },
        { data: r, error: reportsError },
        { data: up, error: updatesError },
        { data: settingsData }
      ] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('chats').select('*').order('created_at', { ascending: false }),
        supabase.rpc('get_reports_with_emails'),
        supabase.from('update_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('admin_permission_settings').select('*').eq('id', 1).maybeSingle()
      ]);

      let nextReports = normalizeReports(r);
      let nextReportsError = reportsError;

      if (reportsError) {
        const { data: fallbackReports, error: fallbackReportsError } = await supabase
          .from('reports')
          .select('id, reporter_id, type, content, status, created_at, profiles:reporter_id(username)')
          .order('created_at', { ascending: false });

        if (!fallbackReportsError) {
          nextReports = normalizeReports(fallbackReports);
          nextReportsError = null;
        } else {
          nextReportsError = fallbackReportsError;
        }
      }

      const fetchError = usersError || chatsError || nextReportsError || updatesError;
      if (fetchError) {
        showToast({ title: 'Admin data failed', description: fetchError.message, variant: 'error' });
      }

      setUsers((u ?? []) as UserProfile[]);
      setChats((c ?? []) as any[]);
      setReports(nextReports);
      setUpdates((up ?? []) as UpdateLog[]);
      setAdminSettings((settingsData as AdminSettings | null) ?? null);
    } catch (err: any) {
      showToast({ title: 'Fetch Error', description: err.message, variant: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'owner') fetchData();
  }, [profile]);

  const handleModeration = async () => {
    if (!modTarget || !modReason.trim()) return;
    setBusy(true);

    let expiry = null;
    if (modAction === 'ban') {
      expiry = new Date();
      expiry.setDate(expiry.getDate() + parseInt(modDuration));
    }

    const { error } = await supabase.rpc('moderate_user', {
      target_id: modTarget.id,
      action_type: modAction,
      reason_text: modReason.trim(),
      expiry: expiry?.toISOString() || null
    });

    if (error) {
      showToast({ title: 'Action failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'User moderated', variant: 'success' });
      setModTarget(null);
      setModReason('');
      fetchData();
    }
    setBusy(false);
  };

  const saveUpdate = async () => {
     if (!newUpdate.version || !newUpdate.title) return;
     const { error } = await supabase.from('update_logs').insert(newUpdate);
     if (!error) {
        showToast({ title: 'Update published', variant: 'success' });
        setNewUpdate({ version: '', title: '', content: '' });
        setAddingUpdate(false);
        fetchData();
     }
  };

  const changePlatformRole = async (targetId: string, role: UserProfile['role']) => {
    setBusy(true);
    const { error } = await supabase.rpc('assign_platform_role', {
      target_id: targetId,
      target_role: role,
    });

    if (error) showToast({ title: 'Role update failed', description: error.message, variant: 'error' });
    else {
      showToast({ title: 'Role updated', variant: 'success' });
      fetchData();
    }
    setBusy(false);
  };

  const saveAdminSettings = async () => {
    if (!adminSettings) return;
    setBusy(true);
    const { error } = await supabase.from('admin_permission_settings').update(adminSettings).eq('id', 1);
    if (error) showToast({ title: 'Settings failed', description: error.message, variant: 'error' });
    else showToast({ title: 'Admin settings saved', variant: 'success' });
    setBusy(false);
  };

  const transferChat = (cid: string) => {
     setTransferTarget(cid);
  };

  const executeTransfer = async () => {
    if (!transferTarget || !newOwnerId.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('transfer_chat_ownership', {
      target_chat_id: transferTarget,
      new_owner_id: newOwnerId.trim()
    });

    if (error) {
      showToast({ title: 'Transfer failed', description: error.message, variant: 'error' });
    } else {
      showToast({ title: 'Ownership transferred', variant: 'success' });
      setTransferTarget(null);
      setNewOwnerId('');
      fetchData();
    }
    setBusy(false);
  };

  if (profile?.role !== 'admin' && profile?.role !== 'owner') return <div className="p-8 text-red-500 font-bold uppercase tracking-widest">UNAUTHORIZED</div>;

  const currentSection = !section || section === 'admin' ? 'admin_users' : section;

  return (
    <div className="app-panel flex-1 overflow-y-auto p-8 bg-[var(--background)]">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-red-500" />
            {currentSection === 'admin_users' && 'Manage Users'}
            {currentSection === 'admin_chats' && 'Manage Chats'}
            {currentSection === 'admin_reports' && 'Reports & Context'}
            {currentSection === 'admin_updates' && 'Update Hub'}
            {currentSection === 'admin_settings' && 'Admin Settings'}
          </h2>
          <p className="text-xs text-muted mt-1 font-semibold opacity-70 uppercase tracking-widest">Platform-level security & system override.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { onNavigate?.('home'); window.history.replaceState(null, '', window.location.pathname); }} className="ui-button secondary h-10 px-4 text-sm font-semibold">
            Back
          </button>
          <button onClick={fetchData} className="ui-button secondary h-10 px-6 font-bold uppercase tracking-widest text-[9px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Network
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-muted/20" />
        </div>
      ) : (
        <div className="space-y-6">
          {currentSection === 'admin_users' && (
            <div className="space-y-4">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Filter network protocols..."
                  className="form-input w-full pl-12 py-3.5 rounded-xl font-bold text-sm"
                />
              </div>
              <div className="grid gap-3">
                {users.filter(u => u.username.toLowerCase().includes(query.toLowerCase())).map(user => (
                  <div key={user.id} className="surface-card p-4 flex items-center justify-between gap-4 border-l-4 border-transparent hover:border-[var(--accent)] transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-[var(--surface-elevated)] flex items-center justify-center font-bold text-lg shadow-inner">
                        {user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-primary flex items-center gap-2">
                           <span className={user.role === 'admin' || user.role === 'owner' ? 'rainbow-name' : ''}>{user.display_name || user.username}</span>
                          <span className="text-[8px] bg-[var(--surface-elevated)] text-muted px-2 py-0.5 rounded font-black uppercase tracking-tighter">{roleLabel(user.role)}</span>
                          {user.banned && <span className="text-[8px] bg-red-600 text-white px-2 py-0.5 rounded font-black uppercase tracking-tighter shadow-lg shadow-red-600/20">BANNED</span>}
                          {user.is_warning && <span className="text-[8px] bg-amber-500 text-black px-2 py-0.5 rounded font-black uppercase tracking-tighter">WARNED</span>}
                        </p>
                        <p className="text-[8px] text-muted font-mono uppercase mt-0.5 opacity-50">UID: {user.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {profile?.role === 'owner' && (
                        <>
                          <button disabled={busy} onClick={() => changePlatformRole(user.id, 'user')} className="ui-button secondary h-9 px-3 font-bold uppercase tracking-widest text-[9px]">User</button>
                          <button disabled={busy} onClick={() => changePlatformRole(user.id, 'admin')} className="ui-button secondary h-9 px-3 font-bold uppercase tracking-widest text-[9px]">Admin</button>
                          <button disabled={busy} onClick={() => changePlatformRole(user.id, 'owner')} className="ui-button secondary h-9 px-3 font-bold uppercase tracking-widest text-[9px]">Owner</button>
                        </>
                      )}
                      <button onClick={() => setModTarget(user)} className="ui-button secondary h-9 px-4 font-bold uppercase tracking-widest text-[9px]">MODERATE</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentSection === 'admin_settings' && (
            <div className="grid gap-4 max-w-3xl">
              <div className="surface-card p-6">
                <h3 className="text-lg font-black text-primary uppercase tracking-tight">Platform Admin Permissions</h3>
                <p className="mt-1 text-sm text-muted">Platform owners always keep every permission. These switches limit regular platform admins.</p>
                <div className="mt-6 grid gap-3">
                  <AdminToggle label="Admins can ban users" checked={adminSettings?.admins_can_ban_users ?? false} onChange={(v) => setAdminSettings((s) => s && ({ ...s, admins_can_ban_users: v }))} />
                  <AdminToggle label="Admins can remove other platform admins" checked={adminSettings?.admins_can_delete_platform_admins ?? false} onChange={(v) => setAdminSettings((s) => s && ({ ...s, admins_can_delete_platform_admins: v }))} />
                  <AdminToggle label="Admins can promote users to platform admin" checked={adminSettings?.admins_can_promote_admins ?? false} onChange={(v) => setAdminSettings((s) => s && ({ ...s, admins_can_promote_admins: v }))} />
                  <AdminToggle label="Admins can manage update logs" checked={adminSettings?.admins_can_manage_updates ?? false} onChange={(v) => setAdminSettings((s) => s && ({ ...s, admins_can_manage_updates: v }))} />
                </div>
                <button disabled={busy || profile?.role !== 'owner'} onClick={saveAdminSettings} className="ui-button primary mt-6 px-6 py-3 font-black uppercase tracking-widest text-xs">
                  Save Settings
                </button>
              </div>
            </div>
          )}

          {currentSection === 'admin_reports' && (
            <div className="grid gap-4">
              {reports.map(report => (
                <div key={report.report_id} className={`surface-card p-6 border-l-4 ${report.report_type === 'bug' ? 'border-amber-500' : 'border-red-500'} shadow-sm hover:shadow-md transition-all`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {report.report_type === 'bug' ? <Bug className="h-5 w-5 text-amber-500" /> : <Flag className="h-5 w-5 text-red-500" />}
                      <span className="text-xs font-black uppercase tracking-widest">{report.report_type}</span>
                    </div>
                    <span className="text-[9px] font-black text-muted font-mono">{format(new Date(report.created_at), 'PPP HH:mm')}</span>
                  </div>
                  
                  <div className="space-y-4">
                     <p className="text-sm text-primary leading-relaxed font-semibold bg-black/10 p-4 rounded-2xl border border-white/5 shadow-inner">&ldquo;{report.report_content}&rdquo;</p>
                     <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-[var(--border)]">
                        <div className="flex items-center gap-2">
                           <User className="h-4 w-4 text-sky-400" />
                           <span className="text-[10px] font-black text-primary uppercase tracking-widest">@{report.reporter_username}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <Mail className="h-4 w-4 text-sky-400" />
                           <span className="text-[10px] font-black text-primary uppercase tracking-widest">{report.reporter_email}</span>
                        </div>
                        {report.target_message_id && (
                           <button 
                             onClick={() => setViewingContext(report)}
                             className="ui-button primary h-8 px-4 text-[9px] font-black uppercase tracking-widest ml-auto"
                           >
                              ANALYZE BLACK BOX
                           </button>
                        )}
                     </div>
                  </div>
                </div>
              ))}
              {reports.length === 0 && <div className="p-32 text-center text-muted font-black uppercase tracking-[0.5em] opacity-20">System Log Empty</div>}
            </div>
          )}

          {currentSection === 'admin_chats' && (
            <div className="grid gap-3">
               {chats.map(chat => (
                  <div key={chat.id} className="surface-card p-4 flex items-center justify-between gap-4 group transition-all rounded-xl">
                     <div className="flex items-center gap-4 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-[var(--surface-elevated)] flex items-center justify-center font-bold text-lg shadow-inner uppercase">{(chat.name || 'C')[0]}</div>
                        <div className="min-w-0">
                           <p className="font-bold text-sm text-primary truncate tracking-tight">{chat.name || 'Untitled Chat'}</p>
                           <p className="text-[8px] text-muted uppercase tracking-widest mt-0.5 opacity-50 font-mono">ID: {chat.id}</p>
                        </div>
                     </div>
                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => transferChat(chat.id)} className="ui-button secondary h-9 px-4 text-[9px] font-bold uppercase tracking-widest hover:border-sky-500/50" title="Transfer Ownership"><UserPlus className="h-4 w-4" /></button>
                        <button onClick={() => { window.location.hash = `chat=${chat.id}`; }} className="ui-button primary h-9 px-6 text-[9px] font-bold uppercase tracking-widest shadow-xl">TERMINAL ENTRY</button>
                     </div>
                  </div>
               ))}
            </div>
          )}

          {currentSection === 'admin_updates' && (
             <div className="space-y-12">
                <div className="flex items-center justify-between bg-sky-500/5 p-12 rounded-xl border border-sky-500/10 shadow-inner">
                   <div>
                      <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Version Control</h3>
                      <p className="text-sm text-muted font-semibold mt-1 uppercase tracking-widest opacity-60">Manage platform update cycles and patch notes.</p>
                   </div>
                   <button onClick={() => setAddingUpdate(true)} className="ui-button primary h-16 px-12 py-4 font-black uppercase tracking-[0.3em] shadow-2xl shadow-sky-600/30 rounded-xl">
                      <Plus className="h-6 w-6" />
                      DEPLOY LOG
                   </button>
                </div>

                <div className="grid gap-8">
                   {updates.map(log => (
                      <div key={log.id} className="surface-card p-10 rounded-xl relative overflow-hidden group border-2 border-transparent hover:border-sky-500/10 transition-all">
                         <div className="absolute top-0 left-0 w-2 h-full bg-sky-500 opacity-20 group-hover:opacity-100 transition-opacity" />
                         <div className="flex items-center justify-between mb-6">
                            <h4 className="text-3xl font-black text-primary uppercase tracking-tight">{log.title}</h4>
                            <div className="flex items-center gap-4">
                               <Clock className="h-5 w-5 text-muted opacity-50" />
                               <span className="text-[11px] font-black text-muted uppercase tracking-widest">{format(new Date(log.created_at), 'PPP')}</span>
                               <span className="text-xs font-black bg-sky-500/10 text-sky-400 px-4 py-2 rounded-full ring-2 ring-sky-500/20 shadow-2xl">V{log.version}</span>
                            </div>
                         </div>
                         <p className="text-muted text-sm whitespace-pre-wrap leading-relaxed bg-black/10 p-8 rounded-xl border border-white/5 font-medium">{log.content}</p>
                      </div>
                   ))}
                </div>
             </div>
          )}
        </div>
      )}

      {/* Report Context Modal */}
      {viewingContext && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/98 backdrop-blur-3xl p-8 animate-in fade-in duration-500">
           <div className="max-w-4xl w-full surface-card p-12 rounded-xl shadow-[0_0_100px_rgba(239,68,68,0.15)] relative border-2 border-red-500/30 flex flex-col h-[85vh]">
              <button onClick={() => setViewingContext(null)} className="absolute top-10 right-10 p-4 text-muted hover:text-red-500 transition-all rounded-xl bg-white/5 border border-white/10 hover:border-red-500/50"><X className="h-8 w-8" /></button>
              
              <div className="mb-10">
                 <h3 className="text-4xl font-black text-primary uppercase tracking-tight flex items-center gap-6">
                    <History className="h-10 w-10 text-red-500" />
                    BLACK BOX SNAPSHOT
                 </h3>
                 <p className="text-sm text-muted font-black uppercase tracking-[0.4em] mt-3 opacity-40">System context retrieval: 10/10 message density</p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-6 pb-6">
                 {viewingContext.context_messages?.map((msg: any, i: number) => (
                    <div key={i} className={`p-8 rounded-xl border ${msg.id === viewingContext.target_message_id ? 'bg-red-500/15 border-red-500 shadow-2xl ring-2 ring-red-500/20' : 'bg-white/5 border-white/5 opacity-80'} transition-all`}>
                       <div className="flex items-center justify-between mb-4">
                          <span className="text-[11px] font-black text-primary uppercase tracking-widest flex items-center gap-3">
                             <div className="h-6 w-6 rounded bg-white/5 flex items-center justify-center"><User className="h-3 w-3" /></div>
                             PID: {msg.sender_id || 'SYSTEM_CORE'}
                          </span>
                          <span className="text-[10px] font-mono text-muted uppercase font-black">{new Date(msg.created_at).toLocaleTimeString()}</span>
                       </div>
                       <p className="text-base text-primary/95 leading-relaxed font-semibold break-words bg-black/5 p-4 rounded-xl">{msg.content}</p>
                    </div>
                 ))}
              </div>

              <div className="mt-10 pt-10 border-t border-white/5 flex justify-between items-center">
                 <button onClick={() => { window.location.hash = `chat=${viewingContext.chat_id}`; setViewingContext(null); }} className="ui-button primary h-16 px-12 font-black uppercase tracking-[0.25em] text-xs flex items-center gap-4 rounded-xl">
                    <ExternalLink className="h-5 w-5" />
                    INJECT INTO CHANNEL
                 </button>
                 <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">EVIDENCE PROTECTION ACTIVE</span>
                    <span className="text-[9px] text-muted uppercase font-bold mt-1">Snapshot ID: {viewingContext.report_id.slice(0, 8)}</span>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Moderation Modal */}
      {modTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
          <div className="surface-card w-full max-w-lg p-12 rounded-xl shadow-2xl border-2 border-red-500/30 relative">
             <div className="absolute top-0 left-0 w-full h-2 bg-red-600 opacity-50" />
             <div className="flex items-center justify-between mb-12">
               <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Moderation Protocol</h3>
               <button onClick={() => setModTarget(null)} className="p-3 hover:bg-white/5 rounded-xl transition-all"><X className="h-8 w-8" /></button>
             </div>

             <div className="space-y-10">
                <div className="p-8 bg-red-600/5 rounded-xl border border-red-600/10 flex items-center gap-6 shadow-inner">
                   <div className="h-16 w-16 bg-red-600/10 rounded-xl flex items-center justify-center text-red-500 font-black text-3xl uppercase">{modTarget.username[0]}</div>
                   <div>
                      <p className="text-[11px] font-black text-red-400 uppercase tracking-[0.3em]">Identity Hub</p>
                      <p className="text-2xl font-bold text-primary mt-1">@{modTarget.username}</p>
                   </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {(['warn', 'ban', 'terminate', 'unban'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => setModAction(action)}
                      className={`py-5 rounded-xl text-[10px] font-black border-2 transition-all uppercase tracking-tighter ${modAction === action ? 'bg-red-600 border-red-500 text-white shadow-2xl shadow-red-600/40' : 'border-white/5 text-muted hover:border-red-500/40'}`}
                    >
                      {action}
                    </button>
                  ))}
                </div>

                {modAction === 'ban' && (
                  <CustomDropdown 
                    label="Sanction Duration" 
                    value={modDuration} 
                    onChange={setModDuration} 
                    options={[{v:'1', l:'1 Cycle'}, {v:'3', l:'3 Cycles'}, {v:'7', l:'1 Week'}, {v:'30', l:'1 Month'}]} 
                  />
                )}

                <label className="block space-y-4">
                  <span className="text-[11px] font-black text-muted uppercase tracking-[0.3em] px-2">Rationale Document</span>
                  <textarea
                    value={modReason}
                    onChange={e => setModReason(e.target.value)}
                    placeholder="Document protocol violations..."
                    className="form-input w-full min-h-[160px] rounded-xl p-6 text-base leading-relaxed font-semibold bg-black/20"
                  />
                </label>

                <button
                  disabled={busy || (!modReason.trim() && modAction !== 'unban')}
                  onClick={handleModeration}
                  className="ui-button primary w-full py-6 text-xl font-black uppercase tracking-[0.4em] bg-red-600 hover:bg-red-500 shadow-2xl shadow-red-600/40 rounded-xl"
                >
                  {busy ? <Loader2 className="animate-spin h-8 w-8 mx-auto" /> : `EXECUTE ${modAction.toUpperCase()}`}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* New Update Log Modal */}
      {addingUpdate && (
         <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
            <div className="surface-card w-full max-w-2xl p-12 rounded-xl shadow-2xl border-2 border-sky-500/30">
               <h3 className="text-3xl font-black mb-10 uppercase tracking-tight text-primary">System Deployment</h3>
               <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-3">
                        <p className="text-[11px] font-black text-muted uppercase tracking-[0.3em] px-2">Build Version</p>
                        <input value={newUpdate.version} onChange={e => setNewUpdate({...newUpdate, version: e.target.value})} placeholder="e.g. 1.3.2" className="form-input w-full font-black text-sky-400" />
                     </div>
                     <div className="space-y-3">
                        <p className="text-[11px] font-black text-muted uppercase tracking-[0.3em] px-2">Deployment Title</p>
                        <input value={newUpdate.title} onChange={e => setNewUpdate({...newUpdate, title: e.target.value})} placeholder="e.g. Core Engine Fix" className="form-input w-full font-bold" />
                     </div>
                  </div>
                  <div className="space-y-3">
                     <p className="text-[11px] font-black text-muted uppercase tracking-[0.3em] px-2">Patch Notes (MD)</p>
                     <textarea value={newUpdate.content} onChange={e => setNewUpdate({...newUpdate, content: e.target.value})} placeholder="Document modifications..." className="form-input w-full min-h-[250px] p-8 text-base leading-relaxed font-semibold bg-black/20" />
                  </div>
                  <div className="flex gap-6 pt-6">
                     <button onClick={() => setAddingUpdate(false)} className="ui-button secondary flex-1 py-6 font-black uppercase tracking-widest text-xs rounded-xl">ABORT</button>
                     <button onClick={saveUpdate} className="ui-button primary flex-1 py-6 font-black uppercase tracking-[0.3em] shadow-2xl text-white rounded-xl">PUBLISH SYSTEM</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Transfer Ownership Modal */}
      {transferTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
          <div className="surface-card w-full max-w-md p-10 rounded-xl shadow-2xl border-2 border-[var(--accent)]/30 relative">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-black text-primary uppercase tracking-tight">Transfer Protocol</h3>
               <button onClick={() => { setTransferTarget(null); setNewOwnerId(''); }} className="p-2 hover:bg-white/5 rounded-lg transition-all"><X className="h-6 w-6" /></button>
             </div>
             
             <div className="space-y-6">
                <div className="space-y-2">
                   <p className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Target User UUID</p>
                   <input 
                     value={newOwnerId} 
                     onChange={e => setNewOwnerId(e.target.value)}
                     placeholder="Paste User ID here..."
                     className="form-input w-full font-mono text-sm"
                   />
                </div>
                <div className="p-4 bg-sky-500/5 rounded-lg border border-sky-500/10">
                   <p className="text-[10px] text-sky-500 font-bold uppercase">Security Warning</p>
                   <p className="text-xs text-muted mt-1">This will permanently reassign administrative control of the room. This action is logged.</p>
                </div>
                <button
                  disabled={!newOwnerId.trim()}
                  onClick={executeTransfer}
                  className="ui-button primary w-full py-4 text-sm font-black uppercase tracking-widest shadow-xl"
                >
                  EXECUTE TRANSFER
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <span className="text-sm font-bold text-primary">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
    </label>
  );
}
