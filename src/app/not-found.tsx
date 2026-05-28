import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="landing-shell flex min-h-screen items-center justify-center p-8 text-center">
      <div className="surface-card max-w-md p-8">
        <Logo className="mx-auto h-20 w-20" />
        <h1 className="mt-6 text-3xl font-semibold text-primary">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">This Raigon page does not exist or cannot be exported for GitHub Pages.</p>
        <Link href="/" className="ui-button primary mt-6 px-4 py-2.5">
          Back home
        </Link>
      </div>
    </main>
  );
}
