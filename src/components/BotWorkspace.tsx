'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Code, Loader2, Play, Plus, Save, Trash2, X, AlertCircle, CheckCircle2, ChevronRight, Zap, MessageCircle, Boxes, Layout, Settings as SettingsIcon, Globe, FileJson, Terminal } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './ToastProvider';
import ConfirmDialog from './ConfirmDialog';

type BotEntity = {
  id: string;
  name: string;
  description: string;
  bot_schema: any;
  owner_id: string;
  created_at: string;
};

type BotRequest = {
  id: string;
  user_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

const DEFAULT_SCHEMA = {
  version: "1.0",
  capabilities: ["chat", "summarize"],
  logic: {
    onMessage: "return `You said: ${message.content}`",
    systemPrompt: "You are a helpful Raigon assistant."
  },
  parameters: {
    temperature: 0.7,
    max_tokens: 500
  }
};

export default function BotWorkspace() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [bots, setBots] = useState<BotEntity[]>([]);
  const [requests, setRequests] = useState<BotRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my_bots' | 'development' | 'marketplace'>('my_bots');
  
  const [selectedBot, setSelectedBot] = useState<BotEntity | null>(null);
  const [botDraft, setBotDraft] = useState({ name: '', description: '', schemaText: JSON.stringify(DEFAULT_SCHEMA, null, 2) });
  const [saving, setSaving] = useState(false);
  const [deletingBot, setDeletingBot] = useState<BotEntity | null>(null);

  const [requestReason, setRequestReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const fetchBots = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [{ data: b }, { data: r }] = await Promise.all([
        supabase.from('bots').select('*').eq('owner_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('bot_creation_requests').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
      ]);
      setBots((b ?? []) as BotEntity[]);
      setRequests((r ?? []) as BotRequest[]);
    } catch (err: any) {
      showToast({ title: 'Fetch Failed', description: err.message, variant: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchBots(); }, [profile]);

  const hasAccess = profile?.can_create_bots || profile?.role === 'admin';
  const pendingRequest = requests.find(r => r.status === 'pending');

  const saveBot = async () => {
    if (!botDraft.name || !profile) return;
    
    let parsedSchema;
    try {
      parsedSchema = JSON.parse(botDraft.schemaText);
    } catch (e) {
      showToast({ title: 'Invalid JSON', description: 'Please check your bot schema syntax.', variant: 'error' });
      return;
    }

    setSaving(true);
    const botData = { 
      name: botDraft.name, 
      description: botDraft.description, 
      bot_schema: parsedSchema,
      prompt: parsedSchema.logic?.systemPrompt || "" // Fallback for old code
    };

    let res;
    if (selectedBot) {
       res = await supabase.from('bots').update(botData).eq('id', selectedBot.id);
    } else {
       res = await supabase.from('bots').insert({ ...botData, owner_id: profile.id });
    }

    if (!res.error) {
       showToast({ title: selectedBot ? 'Protocol Updated' : 'Protocol Initialized', variant: 'success' });
       setSelectedBot(null);
       setBotDraft({ name: '', description: '', schemaText: JSON.stringify(DEFAULT_SCHEMA, null, 2) });
       fetchBots();
    } else {
       showToast({ title: 'Save failed', description: res.error.message, variant: 'error' });
    }
    setSaving(false);
  };

  const deleteBot = async () => {
    if (!deletingBot) return;
    const { error } = await supabase.from('bots').delete().eq('id', deletingBot.id);
    if (!error) {
       showToast({ title: 'Agent Terminated', variant: 'success' });
       setDeletingBot(null);
       if (selectedBot?.id === deletingBot.id) setSelectedBot(null);
       fetchBots();
    }
  };

  const submitAccessRequest = async () => {
     if (!requestReason.trim() || submittingRequest) return;
     setSubmittingRequest(true);
     const { error } = await supabase.rpc('request_bot_creation_access', { reason_text: requestReason.trim() });
     if (!error) {
        showToast({ title: 'Request Transmitted', variant: 'success' });
        fetchBots();
     }
     setSubmittingRequest(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-muted/20" /></div>;

  return (
    <div className="app-panel flex-1 overflow-y-auto p-8 bg-[var(--background)] animate-in fade-in duration-700">
      <header className="mb-10 flex items-center justify-between">
         <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-sky-500/10 border border-sky-500/20 rounded-2xl flex items-center justify-center text-sky-500 shadow-xl shadow-sky-500/5">
               <Terminal className="h-8 w-8" />
            </div>
            <div>
               <h2 className="text-3xl font-semibold text-primary tracking-tight uppercase">Agent Protocol Workspace</h2>
               <p className="text-muted text-sm font-medium mt-1">Code and deploy autonomous schema-based entities.</p>
            </div>
         </div>
      </header>

      {!hasAccess ? (
         <div className="max-w-2xl mx-auto mt-20 text-center space-y-8 animate-in zoom-in-95 duration-500">
            <div className="h-24 w-24 bg-[var(--surface-elevated)] rounded-full flex items-center justify-center mx-auto text-muted/20 border-4 border-dashed border-[var(--border)]">
               <Zap className="h-12 w-12" />
            </div>
            <div className="space-y-3">
               <h3 className="text-2xl font-semibold text-primary uppercase tracking-tight">Access Restricted</h3>
               <p className="text-muted max-w-md mx-auto leading-relaxed">Agent development requires specialized developer permissions to ensure platform integrity.</p>
            </div>
            
            {pendingRequest ? (
               <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl inline-block">
                  <p className="text-amber-500 font-semibold flex items-center gap-2">
                     <History className="h-4 w-4" />
                     PROTOCOL UNDER REVIEW
                  </p>
                  <p className="text-xs text-muted mt-1 uppercase tracking-wider">Our sysadmins will evaluate your dev request shortly.</p>
               </div>
            ) : (
               <div className="surface-card p-8 rounded-3xl space-y-6 max-w-md mx-auto">
                  <p className="text-xs font-semibold text-muted uppercase tracking-[0.2em]">Apply for Developer Access</p>
                  <textarea 
                     value={requestReason} 
                     onChange={e => setRequestReason(e.target.value)}
                     placeholder="State your development goals..." 
                     className="form-input w-full min-h-[120px] p-4 text-sm"
                  />
                  <button 
                     disabled={submittingRequest || !requestReason.trim()} 
                     onClick={submitAccessRequest}
                     className="ui-button primary w-full py-4 font-semibold tracking-wider uppercase shadow-lg shadow-sky-600/20"
                  >
                     {submittingRequest ? 'TRANSMITTING...' : 'REQUEST ACCESS'}
                  </button>
               </div>
            )}
         </div>
      ) : (
         <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
            <div className="space-y-8 min-w-0">
               <div className="flex gap-4 border-b border-[var(--border)] pb-1 overflow-x-auto custom-scrollbar">
                  <TabBtn label="MY AGENTS" active={activeTab === 'my_bots'} onClick={() => setActiveTab('my_bots')} icon={Boxes} />
                  <TabBtn label="DEVELOPMENT" active={activeTab === 'development'} onClick={() => setActiveTab('development')} icon={Code} />
                  <TabBtn label="MARKETPLACE" active={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} icon={Globe} />
               </div>

               {activeTab === 'my_bots' && (
                  <div className="grid gap-4 md:grid-cols-2">
                     <button 
                        onClick={() => { setSelectedBot(null); setBotDraft({name:'', description:'', schemaText: JSON.stringify(DEFAULT_SCHEMA, null, 2)}); }}
                        className="surface-card p-6 border-2 border-dashed border-[var(--border)] rounded-3xl flex flex-col items-center justify-center gap-3 text-muted hover:border-[var(--accent)] hover:text-primary transition-all group"
                     >
                        <div className="h-12 w-12 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center group-hover:scale-110 transition-transform"><Plus className="h-6 w-6" /></div>
                        <span className="font-semibold uppercase tracking-wider text-xs">Register New Protocol</span>
                     </button>
                     
                     {bots.map(bot => (
                        <div key={bot.id} className="surface-card p-6 rounded-3xl border border-[var(--border)] hover:border-[var(--accent)]/30 transition-all group relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { 
                                 setSelectedBot(bot); 
                                 setBotDraft({
                                    name:bot.name, 
                                    description:bot.description, 
                                    schemaText: JSON.stringify(bot.bot_schema || DEFAULT_SCHEMA, null, 2)
                                 }); 
                              }} className="p-2 bg-[var(--surface-elevated)] rounded-lg text-muted hover:text-primary"><SettingsIcon className="h-4 w-4" /></button>
                              <button onClick={() => setDeletingBot(bot)} className="p-2 bg-red-500/10 rounded-lg text-red-500 hover:bg-red-500"><Trash2 className="h-4 w-4" /></button>
                           </div>
                           <div className="flex items-center gap-4 mb-4">
                              <div className="h-12 w-12 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-500 font-semibold">{bot.name[0]}</div>
                              <div>
                                 <h4 className="font-semibold text-primary uppercase tracking-tight">{bot.name}</h4>
                                 <p className="text-[10px] text-muted font-semibold tracking-wider">ACTIVE PROTOCOL</p>
                              </div>
                           </div>
                           <p className="text-sm text-muted line-clamp-2 leading-relaxed">{bot.description || 'No description provided.'}</p>
                           <div className="mt-6 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                 <FileJson className="h-3 w-3 text-sky-500" />
                                 <span className="text-[10px] font-mono text-muted uppercase tracking-tight">v{(bot.bot_schema?.version || '1.0')}</span>
                              </div>
                              <button className="text-[10px] font-semibold text-sky-500 uppercase tracking-wider flex items-center gap-1 hover:gap-2 transition-all">DEBUG LOGS <ChevronRight className="h-3 w-3" /></button>
                           </div>
                        </div>
                     ))}
                  </div>
               )}

               {activeTab !== 'my_bots' && (
                  <div className="p-20 text-center space-y-4 surface-card rounded-3xl border-dashed border-2 border-[var(--border)]">
                     <Layout className="h-12 w-12 text-muted/10 mx-auto" />
                     <p className="text-sm text-muted font-semibold uppercase tracking-[0.2em]">Under Construction</p>
                     <p className="text-xs text-muted/50 max-w-xs mx-auto">This module is part of the Raigon Agent v2.0 experimental featureset.</p>
                  </div>
               )}
            </div>

            <aside className="space-y-8">
               <div className="surface-card p-8 rounded-[2.5rem] border border-[var(--border)] shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-500 to-indigo-600" />
                  <h3 className="text-xl font-semibold text-primary uppercase tracking-tight mb-6 flex items-center gap-3">
                     <Code className="h-5 w-5 text-sky-500" />
                     {selectedBot ? 'Protocol Editor' : 'New Definition'}
                  </h3>
                  
                  <div className="space-y-5">
                     <label className="block space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase text-muted tracking-wider px-1">Protocol Name</span>
                        <input value={botDraft.name} onChange={e => setBotDraft({...botDraft, name: e.target.value})} className="form-input w-full font-semibold" placeholder="e.g. Oracle V1" />
                     </label>
                     <label className="block space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase text-muted tracking-wider px-1">Meta Description</span>
                        <input value={botDraft.description} onChange={e => setBotDraft({...botDraft, description: e.target.value})} className="form-input w-full text-sm" placeholder="Summarizes channel history..." />
                     </label>
                     <label className="block space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase text-muted tracking-wider px-1">Schema Definition (JSON)</span>
                        <textarea 
                           value={botDraft.schemaText} 
                           onChange={e => setBotDraft({...botDraft, schemaText: e.target.value})} 
                           className="form-input w-full min-h-[350px] p-5 text-[13px] font-mono leading-relaxed bg-[var(--background)] border-sky-500/20" 
                           placeholder='{ "version": "1.0", ... }' 
                        />
                     </label>

                     <div className="pt-4 flex gap-3">
                        {selectedBot && <button onClick={() => setSelectedBot(null)} className="ui-button secondary flex-1 py-4 font-semibold">CANCEL</button>}
                        <button 
                           disabled={saving || !botDraft.name} 
                           onClick={saveBot}
                           className="ui-button primary flex-[2] py-4 font-semibold shadow-lg shadow-sky-600/20 uppercase tracking-wider"
                        >
                           {saving ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : (selectedBot ? 'PUSH UPDATE' : 'INITIALIZE PROTOCOL')}
                        </button>
                     </div>
                  </div>
               </div>

               {/* Protocol Simulator */}
               <div className="surface-card p-8 rounded-[2.5rem] border border-[var(--border)] shadow-xl relative">
                  <h3 className="text-xl font-semibold text-primary uppercase tracking-tight mb-6 flex items-center gap-3">
                     <Play className="h-5 w-5 text-emerald-500" />
                     Protocol Simulator
                  </h3>
                  <div className="space-y-4">
                     <div className="p-4 bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border)]">
                        <p className="text-[10px] font-bold text-muted uppercase mb-2">Mock Input</p>
                        <input className="form-input w-full text-sm" placeholder="Type a test message..." id="sim-input" />
                     </div>
                     <button 
                        onClick={() => {
                           const val = (document.getElementById('sim-input') as HTMLInputElement)?.value;
                           try {
                              const schema = JSON.parse(botDraft.schemaText);
                              // Simple simulation of onMessage logic
                              const result = schema.logic?.onMessage 
                                 ? `[SIMULATED] ${schema.name || 'Bot'}: ${val.toUpperCase()}` // Mock logic execution
                                 : "[SIMULATED] System: No onMessage logic defined.";
                              showToast({ title: 'Simulation Result', description: result, variant: 'info' });
                           } catch (e) {
                              showToast({ title: 'Sim Error', description: 'Malformed schema.', variant: 'error' });
                           }
                        }}
                        className="ui-button secondary w-full py-3 font-semibold uppercase text-emerald-500 hover:bg-emerald-500/5 transition-all"
                     >
                        RUN TEST CYCLE
                     </button>
                  </div>
               </div>

               <div className="p-6 bg-sky-500/5 rounded-3xl border border-sky-500/10 space-y-4">
                  <div className="flex items-center gap-3 text-sky-500">
                     <AlertCircle className="h-5 w-5" />
                     <p className="text-xs font-semibold uppercase tracking-wider">Protocol Validation</p>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed uppercase font-medium">Definitions must adhere to the Raigon Agent Schema v1.0 specification. malformed protocols will fail to deploy.</p>
               </div>
            </aside>
         </div>
      )}

      <ConfirmDialog 
        open={Boolean(deletingBot)}
        title="PURGE PROTOCOL?"
        description={`This will permanently delete the "${deletingBot?.name}" agent protocol from the platform database. This cannot be reversed.`}
        confirmLabel="PURGE PROTOCOL"
        onCancel={() => setDeletingBot(null)}
        onConfirm={deleteBot}
      />
    </div>
  );
}

function TabBtn({ label, active, onClick, icon: Icon }: any) {
   return (
      <button 
         onClick={onClick}
         className={`flex items-center gap-2 px-6 py-3 text-xs font-semibold tracking-wider transition-all border-b-2 ${active ? 'border-sky-500 text-primary' : 'border-transparent text-muted hover:text-primary'}`}
      >
         <Icon className="h-4 w-4" />
         {label}
      </button>
   );
}
