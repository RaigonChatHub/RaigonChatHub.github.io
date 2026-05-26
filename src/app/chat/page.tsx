import Link from 'next/link';

export default function ChatIndexPage() {
  return (
    <main className="app-shell flex min-h-screen items-center justify-center p-8 text-center">
      <div className="surface-card max-w-md p-8">
        <h1 className="text-2xl font-bold text-primary">Select a chat</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Open a chat from the sidebar or use a shareable chat URL.</p>
        <Link href="/" className="ui-button primary mt-6 inline-block px-4 py-2.5">
          Back to Raigon
        </Link>
      </div>
    </main>
  );
}
