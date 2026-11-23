import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

export default function HomePage() {
  return (
    <main>
      <section className="page-hero">
        <div className="shell grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-7">
            <BrandMark className="fade-up" />
            <h1 className="fade-up-delay m-0 max-w-xl text-[clamp(2.5rem,6.5vw,4.75rem)] leading-[0.98]">
              Track who paid.
              <br />
              Collect what&apos;s due.
            </h1>
            <p className="lead fade-up-delay-2">
              A calm rent workspace for landlords and renters — dues, proof of payment, and
              reminders in one place.
            </p>
            <div className="fade-up-delay-2 flex flex-wrap gap-3">
              <Link href="/register" className="btn btn-primary">
                Create account
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
            </div>
          </div>

          <aside className="ledger-specimen fade-up-delay-2" aria-hidden="true">
            <p className="eyebrow">This month</p>
            <div className="ledger-specimen-row">
              <div>
                <p className="m-0 font-medium">Ana Reyes · 2B</p>
                <p className="mt-1 mb-0 text-sm text-[var(--muted)]">Mira Residences</p>
              </div>
              <div className="text-right">
                <p className="amount m-0">₱18,500</p>
                <p className="status status-paid mt-1 mb-0 justify-end">
                  <span className="status-dot" />
                  Paid
                </p>
              </div>
            </div>
            <div className="ledger-specimen-row">
              <div>
                <p className="m-0 font-medium">Jon Cruz · 1A</p>
                <p className="mt-1 mb-0 text-sm text-[var(--muted)]">Mira Residences</p>
              </div>
              <div className="text-right">
                <p className="amount m-0">₱16,000</p>
                <p className="status status-due mt-1 mb-0 justify-end">
                  <span className="status-dot" />
                  Due
                </p>
              </div>
            </div>
            <div className="ledger-specimen-row">
              <div>
                <p className="m-0 font-medium">Kim Santos · Studio</p>
                <p className="mt-1 mb-0 text-sm text-[var(--muted)]">Oak Lofts</p>
              </div>
              <div className="text-right">
                <p className="amount m-0">₱12,500</p>
                <p className="status status-overdue mt-1 mb-0 justify-end">
                  <span className="status-dot" />
                  Overdue
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="shell pb-20">
        <p className="eyebrow">How it helps</p>
        <h2 className="section-title mt-3 max-w-md">Clarity for both sides of the lease</h2>
        <div className="mt-12 grid gap-12 md:grid-cols-3">
          {[
            {
              title: 'Landlord tracker',
              body: 'See paid, due, and overdue renters at a glance — then confirm proofs in one pass.',
            },
            {
              title: 'Renter portal',
              body: 'Know what is due this month and submit payment proof without chasing chats.',
            },
            {
              title: 'Gentle reminders',
              body: 'Nudge overdue balances before they pile up, without noisy spam.',
            },
          ].map((item) => (
            <article key={item.title} className="border-t border-[var(--border)] pt-5">
              <h3 className="m-0 text-xl">{item.title}</h3>
              <p className="mt-3 mb-0 leading-relaxed text-[var(--muted)]">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
