import { Suspense } from 'react';
import AppProviders from '@/components/AppProviders';
import ChatPageClient from '@/components/ChatPageClient';

export default function ChatPage() {
  return (
    <AppProviders>
      <Suspense
        fallback={
          <div className="app-shell flex min-h-screen items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <ChatPageClient />
      </Suspense>
    </AppProviders>
  );
}
