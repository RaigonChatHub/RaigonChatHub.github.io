'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ChatRoom from '@/components/ChatRoom';
import Login from '@/components/Login';
import Sidebar from '@/components/Sidebar';
import AgeVerification from '@/components/AgeVerification';
import { useAuth } from '@/context/AuthContext';

export default function ChatPageClient() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('id');
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);

  const currentChatId = useMemo(() => chatId || undefined, [chatId]);

  useEffect(() => {
    // Hydration guard for auth state that only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Login />;

  if (!chatId) {
    return (
      <main className="app-shell flex min-h-screen items-center justify-center p-8 text-center">
        <div className="surface-card max-w-md p-8">
          <h1 className="text-2xl font-bold text-primary">Missing chat</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Open a chat from the app sidebar to get a shareable chat URL.</p>
          <Link href="/" className="ui-button primary mt-6 px-4 py-2.5">
            Back to Raigon
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell flex h-screen overflow-hidden">
      <AgeVerification />
      <Sidebar
        currentView="chat"
        currentChatId={currentChatId}
        onNavigate={() => {
          window.location.href = '/';
        }}
        onSelectChat={(id) => {
          window.history.pushState(null, '', `/chat/?id=${encodeURIComponent(id)}`);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
      />
      <ChatRoom
        chatId={chatId}
        onOpenChat={(id) => {
          window.location.href = `/chat/?id=${encodeURIComponent(id)}`;
        }}
      />
    </main>
  );
}
