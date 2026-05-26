'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, MessageSquare, Radio, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { createClient, hasSupabaseConfig } from '@/lib/supabase';
import Logo from './Logo';
import { useToast } from './ToastProvider';
import { useTheme } from '@/context/ThemeContext';
import { appUrl } from '@/lib/paths';

function getAgeFromDob(dob: string) {
  const birthday = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birthday.getTime())) return null;

  const today = new Date();
  if (birthday > today) return null;

  let age = today.getFullYear() - birthday.getFullYear();
  const monthOffset = today.getMonth() - birthday.getMonth();

  if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < birthday.getDate())) {
    age -= 1;
  }

  if (age < 1 || age > 120) return null;
  return age;
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const supabaseReady = hasSupabaseConfig();

  const age = dob ? getAgeFromDob(dob) : null;
  const requiresParent = age !== null && age < 13;

  const handleGoogleLogin = async () => {
    if (!supabaseReady) {
      setError('Supabase is not configured for this deployment.');
      return;
    }

    const supabase = createClient();
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: appUrl(),
      },
    });

    if (googleError) {
      showToast({
        title: 'Google sign-in failed',
        description: googleError.message,
        variant: 'error',
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabaseReady) {
      setError('Supabase is not configured for this deployment.');
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    if (isSignUp) {
      if (!dob || age === null) {
        setError('Enter a valid date of birth.');
        setLoading(false);
        return;
      }

      if (requiresParent && !parentEmail) {
        setError('Parent email is required for users under 13.');
        setLoading(false);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            user_name: username,
            age,
            date_of_birth: dob,
            parent_email: requiresParent ? parentEmail : null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        showToast({
          title: 'Check your email',
          description: 'Supabase sent a confirmation link to finish sign-up.',
          variant: 'success',
        });
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) setError(signInError.message);
    }

    setLoading(false);
  };

  return (
    <main className="landing-shell min-h-screen">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <Logo className="h-11 w-11" />
          <div>
            <p className="text-base font-bold text-primary">Raigon</p>
            <p className="text-xs text-muted">Chat Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/terms/" className="hidden text-sm font-semibold text-muted transition hover:text-primary sm:inline">Terms</Link>
          <Link href="/privacy/" className="hidden text-sm font-semibold text-muted transition hover:text-primary sm:inline">Privacy</Link>
          <button type="button" onClick={toggleTheme} className="ui-button secondary px-3 py-2 text-sm">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-6 pb-10 pt-6 lg:grid-cols-[minmax(0,1.05fr)_430px] lg:items-center lg:pb-14">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-token bg-elevated px-3 py-1 text-xs font-semibold text-muted">
            <Sparkles className="h-3.5 w-3.5 text-rainbow-blue" />
            Fast rooms, focused settings, serious moderation
          </div>

          <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[1.02] text-primary sm:text-6xl lg:text-7xl">
            Chat that stays organized when groups get busy.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            Raigon brings direct messages, private groups, public discovery, owner tools, pinned updates, and age-aware account controls into one clean workspace.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => setIsSignUp(true)} className="ui-button primary px-5 py-3">
              Create account
              <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setIsSignUp(false)} className="ui-button secondary px-5 py-3">
              Sign in
            </button>
          </div>

          <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-4">
            <Feature icon={MessageSquare} label="Realtime DMs" />
            <Feature icon={Users} label="Group hubs" />
            <Feature icon={ShieldCheck} label="Moderation" />
            <Feature icon={Bot} label="Custom bots" />
          </div>

          <div className="app-preview mt-8 max-w-3xl">
            <div className="app-preview-sidebar">
              <span className="active" />
              <span />
              <span />
              <span className="short" />
            </div>
            <div className="app-preview-chat">
              <div className="preview-banner">
                <Radio className="h-4 w-4" />
                Owner broadcast: event starts at 7
              </div>
              <div className="message other">Can someone pin the rules?</div>
              <div className="message mine">Pinned and visible at the top.</div>
              <div className="message other short">Typing...</div>
            </div>
          </div>
        </div>

        <div className="auth-panel">
          <div className="mb-6 flex items-center gap-3">
            <Logo className="h-12 w-12" />
            <div>
              <h2 className="text-2xl font-bold text-primary">{isSignUp ? 'Create account' : 'Welcome back'}</h2>
              <p className="text-sm text-muted">{isSignUp ? 'Set up a safer profile.' : 'Open your chats.'}</p>
            </div>
          </div>

          {!supabaseReady && (
            <div role="alert" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
              This GitHub Pages build is missing Supabase configuration. Set `NEXT_PUBLIC_SUPABASE_URL` and
              `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Actions variables or secrets for the build environment, then rerun the Pages workflow.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <Field label="Username" type="text" required placeholder="dragon_slayer" value={username} onChange={setUsername} />
                <Field label="Date of birth" type="date" required placeholder="" value={dob} onChange={setDob} max={new Date().toISOString().slice(0, 10)} />
                {requiresParent && (
                  <div className="space-y-2">
                    <Field
                      label="Parent email"
                      type="email"
                      required
                      placeholder="parent@example.com"
                      value={parentEmail}
                      onChange={setParentEmail}
                    />
                    <p className="px-1 text-xs text-muted">Parental consent is required for users under 13.</p>
                  </div>
                )}
              </>
            )}

            <Field label="Email address" type="email" required placeholder="you@example.com" value={email} onChange={setEmail} />
            <Field label="Password" type="password" required placeholder="Enter your password" value={password} onChange={setPassword} />

            {error && (
              <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !supabaseReady} className="ui-button primary w-full justify-center py-3">
              {loading ? 'Processing...' : isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs uppercase text-muted">
            <span className="h-px flex-1 bg-border-token" />
            Or
            <span className="h-px flex-1 bg-border-token" />
          </div>

          <button type="button" onClick={handleGoogleLogin} disabled={!supabaseReady} className="ui-button secondary w-full justify-center py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-inverted">
              G
            </span>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsSignUp(!isSignUp);
            }}
            className="mt-5 w-full text-center text-sm font-medium text-link transition hover:opacity-80"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>

          <p className="mt-5 text-center text-xs leading-5 text-muted">
            By using Raigon, you agree to the{' '}
            <Link href="/terms/" className="text-link transition hover:text-link-hover">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy/" className="text-link transition hover:text-link-hover">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="surface-card flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 text-rainbow-blue" />
      <span className="text-sm font-semibold text-primary">{label}</span>
    </div>
  );
}

function Field({
  label,
  type,
  required,
  placeholder,
  value,
  onChange,
  max,
}: {
  label: string;
  type: string;
  required?: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-primary">{label}</label>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        className="form-input w-full px-4 py-3"
        value={value}
        max={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
