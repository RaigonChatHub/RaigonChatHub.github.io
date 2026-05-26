import { Suspense } from 'react';
import AppProviders from '@/components/AppProviders';
import ChatPageClient from '@/components/ChatPageClient';

interface ChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  return (
    <AppProviders>
      <Suspense
        fallback={
          <div className="app-shell flex min-h-screen items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <ChatPageClient chatId={id} />
      </Suspense>
    </AppProviders>
  );
}
