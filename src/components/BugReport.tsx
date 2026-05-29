'use client';

import React, { useState } from 'react';
import { Bug, Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useToast } from './ToastProvider';
import { useAuth } from '@/context/AuthContext';

export default function BugReport() {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { showToast } = useToast();
  const { profile } = useAuth();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sending) return;

    setSending(true);
    let { error } = await supabase.rpc('submit_report', {
      report_type: 'bug',
      report_content: content.trim()
    });

    if (error && profile) {
      const fallback = await supabase.from('reports').insert({
        reporter_id: profile.id,
        type: 'bug',
        content: content.trim(),
      });
      error = fallback.error;
    }

    if (error) {
      showToast({ title: 'Submission failed', description: error.message, variant: 'error' });
    } else {
      setSubmitted(true);
      setContent('');
      showToast({ title: 'Report transmitted', variant: 'success' });
    }
    setSending(false);
  };

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[var(--background)]">
        <div className="surface-card max-w-md p-10 text-center rounded-3xl shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="h-20 w-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-500 mb-6">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-semibold text-primary uppercase tracking-tight">Report Received</h2>
          <p className="mt-4 text-muted leading-relaxed">Your feedback has been logged in our system. Our engineering team will investigate the issue shortly.</p>
          <button onClick={() => setSubmitted(false)} className="ui-button primary mt-8 w-full py-4 font-semibold uppercase tracking-wider">SUBMIT ANOTHER</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[var(--background)]">
      <div className="max-w-2xl mx-auto">
        <header className="mb-10 flex items-center gap-4">
          <div className="h-14 w-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 shadow-xl">
            <Bug className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-3xl font-semibold text-primary tracking-tight uppercase ">Bug Reporting</h2>
            <p className="text-muted text-sm font-medium mt-1">Help us improve the Raigon experience.</p>
          </div>
        </header>

        <section className="surface-card p-8 rounded-3xl border border-[var(--border)] shadow-xl">
          <div className="flex items-start gap-4 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl mb-8">
             <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
             <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed font-medium uppercase">Please be as descriptive as possible. Include steps to reproduce the issue and any error messages you encountered.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <label className="block space-y-2">
              <span className="text-[10px] font-semibold uppercase text-muted tracking-wider px-1">Describe the Issue</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What happened? What did you expect to happen?"
                className="form-input w-full min-h-[250px] p-6 text-sm leading-relaxed"
                required
              />
            </label>

            <button
              disabled={sending || !content.trim()}
              className="ui-button primary w-full py-4 text-lg font-semibold shadow-lg shadow-sky-600/20 uppercase tracking-wider flex items-center justify-center gap-3"
            >
              {sending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              {sending ? 'TRANSMITTING...' : 'TRANSMIT REPORT'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
