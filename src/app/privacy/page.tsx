import Link from 'next/link';
import type React from 'react';

export default function PrivacyPage() {
  return (
    <main className="legal-page min-h-screen px-6 py-8">
      <article className="legal-card mx-auto max-w-4xl p-8">
        <h1 className="text-3xl font-black text-primary">Privacy Policy</h1>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">Last updated May 25, 2026</p>
        <p className="mt-5 text-sm leading-7 text-muted">
          This policy explains what Raigon Chat Hub stores and uses to run accounts, chats, moderation, invites, settings, and safety tools.
        </p>

        <div className="mt-8 grid gap-5">
          <LegalSection title="Account Data">
            We store email authentication data through Supabase, plus username, display name, role, date of birth, parent email when required,
            account status, and account alerts.
          </LegalSection>
          <LegalSection title="Chat Data">
            We store chats, direct messages, group memberships, messages, pinned state, broadcast state, invite codes, room images, banners,
            and group settings.
          </LegalSection>
          <LegalSection title="Moderation Data">
            Platform admins may store bans, ban reasons, alerts, and moderation action records. Group owners and managers may manage membership
            and room-level settings.
          </LegalSection>
          <LegalSection title="Access Control">
            Private chats are intended to be visible only to members and platform admins. Discoverable rooms can be listed publicly so users can
            find and join them.
          </LegalSection>
          <LegalSection title="Security">
            Authentication and row-level security are handled through Supabase. Users should use strong passwords and change them from account
            settings when needed.
          </LegalSection>
        </div>
        <Link href="/" className="ui-button primary mt-8 px-4 py-2.5">Back to Raigon</Link>
      </article>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">{children}</p>
    </section>
  );
}
