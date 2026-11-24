import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="shell landing-hero-grid">
          <div className="landing-hero-copy">
            <BrandMark className="fade-up" size="lg" />
            <h1 className="landing-headline fade-up-delay">
              Track who paid.
              <br />
              Collect what&apos;s due.
            </h1>
            <p className="lead fade-up-delay-2">
              BayadRent is the calm rent workspace for Philippine landlords and renters —
              dues, proof of payment, and reminders in one place.
            </p>
            <div className="landing-cta fade-up-delay-2">
              <Link href="/register" className="btn btn-primary">
                Start collecting
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
            </div>
          </div>

          <aside className="landing-product fade-up-delay-2" aria-hidden="true">
            <div className="landing-product-glow" />
            <div className="ledger-specimen landing-ledger">
              <div className="landing-ledger-head">
                <p className="eyebrow">This month</p>
                <p className="landing-ledger-caption">Collection board</p>
              </div>
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
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-proof">
        <div className="shell landing-proof-inner">
          <p className="landing-proof-kicker">Built for Philippine landlords</p>
          <p className="landing-proof-copy">
            From boarding houses in Quezon City to condo units in Makati — one board for dues,
            GCash proofs, and follow-ups.
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="shell landing-split">
          <div>
            <p className="eyebrow">For landlords</p>
            <h2 className="landing-section-title">See every unit&apos;s status without opening a spreadsheet</h2>
            <p className="lead landing-section-lead">
              Generate monthly invoices, review GCash proofs, and mark paid — all from one
              collection board.
            </p>
          </div>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              Add properties, units, and leases
            </li>
            <li>
              <span>02</span>
              Generate this month&apos;s dues
            </li>
            <li>
              <span>03</span>
              Confirm proofs and chase what&apos;s overdue
            </li>
          </ol>
        </div>
      </section>

      <section className="landing-section landing-section-tint">
        <div className="shell landing-split">
          <div>
            <p className="eyebrow">For renters</p>
            <h2 className="landing-section-title">Know what&apos;s due — and prove you paid</h2>
            <p className="lead landing-section-lead">
              Check invoices, upload payment proof, and stop chasing landlords in chat threads.
            </p>
          </div>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              See this month&apos;s amount and due date
            </li>
            <li>
              <span>02</span>
              Pay via GCash or your usual channel
            </li>
            <li>
              <span>03</span>
              Upload proof and wait for confirmation
            </li>
          </ol>
        </div>
      </section>

      <section className="landing-close">
        <div className="shell landing-close-inner">
          <BrandMark size="md" />
          <h2 className="landing-close-title">Ready to collect rent with less friction?</h2>
          <p className="lead">
            Create a free account and set up your first property in minutes.
          </p>
          <div className="landing-cta">
            <Link href="/register" className="btn btn-primary">
              Create account
            </Link>
            <Link href="/login" className="btn btn-ghost">
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
