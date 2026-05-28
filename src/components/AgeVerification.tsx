'use client';

import React, { useState } from 'react';
import { Mail, CheckCircle2, ShieldAlert, Calendar as CalendarIcon, ArrowRight } from 'lucide-react';
import { createClient, hasSupabaseConfig } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './ToastProvider';
import CyberAgePicker from './CyberAgePicker';

function getValidAge(dob: string) {
  const birthday = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birthday.getTime())) return null;

  const today = new Date();
  if (birthday > today) return null;

  let age = today.getFullYear() - birthday.getFullYear();
  const monthOffset = today.getMonth() - birthday.getMonth();
  if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < birthday.getDate())) age -= 1;

  if (age < 1 || age > 120) return null;
  return age;
}

export default function AgeVerification() {
  const { user, profile, refreshProfile } = useAuth();
  const [dob, setDob] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  if (!user || !profile || profile.age !== null) return null;

  const age = dob ? getValidAge(dob) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSupabaseConfig()) {
      setError('System configuration error.');
      return;
    }

    if (age === null) {
      setError('Please select a valid birth date.');
      return;
    }
    
    if (age < 13 && !parentEmail) {
      setError('Parental oversight is required.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
         age, 
         date_of_birth: dob, 
         parent_email: age < 13 ? parentEmail : null,
         parent_approved: age >= 13 
      })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await refreshProfile();
      showToast({ title: 'Identity Verified', variant: 'success' });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
      <div className="surface-card w-full max-w-xl p-10 shadow-[0_0_50px_rgba(14,165,233,0.1)] rounded-[2.5rem] border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 opacity-50" />
        
        <header className="text-center mb-10">
           <div className="h-16 w-16 bg-sky-500/10 rounded-2xl flex items-center justify-center text-sky-400 mx-auto mb-6 shadow-[0_0_20px_rgba(14,165,233,0.15)] ring-4 ring-sky-500/5">
              <CalendarIcon className="h-8 w-8" />
           </div>
           <h2 className="text-3xl font-semibold text-primary tracking-tight uppercase">Identity Protocol</h2>
           <p className="text-muted text-sm mt-1 font-medium">Verify your age to secure your network access.</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
             <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-1">Select Date of Birth</p>
             <CyberAgePicker value={dob} onChange={setDob} />
          </div>

          {age !== null && age < 13 && (
            <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
               <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-500/80 leading-relaxed font-semibold uppercase">Under-age detected. Parental approval is required for full platform features.</p>
               </div>
               <label className="block space-y-2">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider px-1">Parent Email Address</span>
                  <div className="relative group">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-sky-500 transition-colors" />
                     <input
                       type="email"
                       required
                       className="form-input w-full pl-11 bg-black/20 border-white/5"
                       placeholder="guardian@email.com"
                       value={parentEmail}
                       onChange={(e) => setParentEmail(e.target.value)}
                     />
                  </div>
               </label>
            </div>
          )}

          {error && (
             <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl text-red-500 text-xs font-semibold text-center uppercase tracking-tight">
                {error}
             </div>
          )}

          <button
            type="submit"
            disabled={loading || !dob}
            className="ui-button primary w-full py-5 text-lg font-semibold tracking-tight uppercase shadow-lg shadow-sky-600/20 hover:scale-[1.01] active:scale-95 transition-all"
          >
            {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : 'INITIALIZE ACCOUNT'}
          </button>
        </form>
      </div>
    </div>
  );
}
