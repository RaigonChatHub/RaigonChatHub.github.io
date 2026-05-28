import Link from 'next/link';
import type React from 'react';

export default function TermsPage() {
  return (
    <main className="legal-page min-h-screen px-6 py-8">
      <article className="legal-card mx-auto max-w-4xl p-8">
        <h1 className="text-3xl font-semibold text-primary">Terms of Service</h1>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted">Last updated May 25, 2026</p>
        <p className="mt-5 text-sm leading-7 text-muted">
          These terms govern access to Raigon Chat Hub, including direct messages, private groups, discoverable rooms, moderation tools, bots,
          invites, pinned messages, and broadcasts.
        </p>

        <div className="mt-8 grid gap-5">
          <LegalSection title="Accounts">
            You are responsible for your account activity, password security, username, and profile information. You may not impersonate others,
            automate abuse, evade bans, or interfere with platform security.
          </LegalSection>
          <LegalSection title="Age And Safety">
            Date of birth is required for age-aware access. Accounts under 13 require parent approval before chatting. Users may not falsify age
            information to bypass safety restrictions.
          </LegalSection>
          <LegalSection title="Chats And Moderation">
            Group owners, chat managers, and platform admins may remove members, configure safety rules, pin messages, send broadcasts, manage
            invites, and restrict abusive behavior according to their permissions.
          </LegalSection>
          <LegalSection title="Prohibited Content">
            Do not post illegal content, threats, harassment, sexual exploitation, spam, malware, doxxing, hate content, or attempts to bypass
            profanity and moderation controls.
          </LegalSection>
          <LegalSection title="Availability">
            Raigon may change, limit, suspend, or discontinue features. The service is provided as-is without a guarantee that every feature is
            available at all times.
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
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">{children}</p>
    </section>
  );
}
