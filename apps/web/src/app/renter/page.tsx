'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Celebrate, type CelebratePayload } from '@/components/celebrate';
import { EmptyGuide } from '@/components/empty-guide';
import { GcashPayPanel } from '@/components/gcash-pay-panel';
import { NotificationInbox, type InboxItem } from '@/components/notification-inbox';
import { Pagination, paginate } from '@/components/pagination';
import { DashboardSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import {
  api,
  type AuthUser,
  type CalendarInvoice,
  type InvoiceLineItem,
  type PaymentTiming,
  type RenterInvoice,
  type RenterLease,
} from '@/lib/api';
import { clearSession, getStoredUser, getToken, saveSession } from '@/lib/auth-storage';
import { statusClass } from '@/lib/status';

type RenterTab = 'invoices' | 'calendar' | 'profile';

const tabs: { key: RenterTab; label: string }[] = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'profile', label: 'Profile' },
];

function formatPhp(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-PH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function timingClass(timing: PaymentTiming) {
  switch (timing) {
    case 'EARLY':
      return 'timing-badge timing-early';
    case 'ON_TIME':
      return 'timing-badge timing-on-time';
    case 'LATE':
      return 'timing-badge timing-late';
    case 'WAIVED':
      return 'timing-badge timing-waived';
    default:
      return 'timing-badge timing-unpaid';
  }
}

function LineBreakdown({ lines }: { lines?: InvoiceLineItem[] }) {
  if (!lines?.length) return null;
  return (
    <ul className="line-breakdown">
      {lines.map((line) => (
        <li key={line.id}>
          <span>
            {line.label}
            {line.kind === 'UTILITY' && (line.quantity ?? 0) > 0 ? (
              <span className="line-breakdown-meta">
                {' '}
                · {line.quantity} {line.unitLabel || 'unit'} × ₱
                {Number(line.unitRate ?? 0).toFixed(2)}
              </span>
            ) : null}
          </span>
          <span className="mono">{formatPhp(line.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RenterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const invoicesRef = useRef<HTMLElement | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [leases, setLeases] = useState<RenterLease[]>([]);
  const [invoices, setInvoices] = useState<RenterInvoice[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [highlightInvoiceId, setHighlightInvoiceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RenterTab>('invoices');
  const [invoicePage, setInvoicePage] = useState(1);
  const [inboxPage, setInboxPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [celebrate, setCelebrate] = useState<CelebratePayload>(null);
  const INVOICE_PAGE_SIZE = 6;
  const INBOX_PAGE_SIZE = 8;

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calendarItems, setCalendarItems] = useState<CalendarInvoice[]>([]);

  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const refresh = useCallback(async (authToken: string) => {
    const [leaseList, invoiceList, notifications] = await Promise.all([
      api.myLeases(authToken),
      api.myInvoices(authToken),
      api.listNotifications(authToken),
    ]);
    setLeases(leaseList);
    setInvoices(invoiceList);
    setInbox(notifications);
  }, []);

  const loadCalendar = useCallback(
    async (authToken: string, year: number, month: number) => {
      const data = await api.myCalendar(authToken, year, month);
      setCalendarItems(data.items);
    },
    [],
  );

  useEffect(() => {
    const authToken = getToken();
    const stored = getStoredUser();
    if (!authToken || !stored) {
      router.replace('/login');
      return;
    }
    if (stored.role !== 'RENTER') {
      router.replace('/landlord');
      return;
    }

    setUser(stored);
    setToken(authToken);

    api
      .me(authToken)
      .then((profile) => {
        setUser(profile);
        setProfileForm({
          fullName: profile.fullName ?? '',
          phone: profile.phone ?? '',
          emergencyContactName: profile.emergencyContactName ?? '',
          emergencyContactPhone: profile.emergencyContactPhone ?? '',
        });
      })
      .catch(() => {
        clearSession();
        router.replace('/login');
      });

    setLoading(true);
    refresh(authToken)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router, refresh]);

  useEffect(() => {
    if (!token || activeTab !== 'calendar') return;
    loadCalendar(token, calYear, calMonth).catch((err: Error) => {
      setError(err.message);
      toast(err.message, 'error');
    });
  }, [token, activeTab, calYear, calMonth, loadCalendar, toast]);

  function logout() {
    clearSession();
    router.push('/login');
  }

  async function onSubmitPayment(e: FormEvent, invoiceId: string) {
    e.preventDefault();
    if (!token) return;
    setActionKey(`pay-${invoiceId}`);
    setError(null);
    try {
      const invoice = invoices.find((item) => item.id === invoiceId);
      await api.submitPayment(token, invoiceId, {
        note: notes[invoiceId],
        proof: files[invoiceId] ?? null,
      });
      setNotes((prev) => ({ ...prev, [invoiceId]: '' }));
      setFiles((prev) => ({ ...prev, [invoiceId]: null }));
      await refresh(token);
      toast('Payment submitted for review.', 'success');
      setCelebrate({
        title: 'Payment submitted!',
        subtitle: invoice
          ? `${formatPhp(invoice.amount)} · waiting for landlord confirmation`
          : 'Waiting for landlord confirmation',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit payment';
      setError(message);
      toast(message, 'error');
    } finally {
      setActionKey(null);
    }
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!token || !user) return;
    setActionKey('profile');
    setError(null);
    try {
      const updated = await api.updateProfile(token, {
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        emergencyContactName: profileForm.emergencyContactName,
        emergencyContactPhone: profileForm.emergencyContactPhone,
      });
      setUser(updated);
      saveSession(token, updated);
      toast('Profile saved.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setError(message);
      toast(message, 'error');
    } finally {
      setActionKey(null);
    }
  }

  async function onMarkOneRead(id: string) {
    if (!token) return;
    try {
      await api.markNotificationRead(token, id);
      await refresh(token);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not mark read', 'error');
    }
  }

  async function onOpenNotification(item: InboxItem) {
    if (!token) return;
    if (!item.readAt) {
      try {
        await api.markNotificationRead(token, item.id);
        await refresh(token);
      } catch {
        /* continue */
      }
    }

    if (item.relatedInvoiceId) {
      setHighlightInvoiceId(item.relatedInvoiceId);
    }
    setActiveTab('invoices');
    requestAnimationFrame(() => {
      invoicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(calYear, calMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate();
    const byDay = new Map<number, CalendarInvoice[]>();
    for (const item of calendarItems) {
      const day = Number(item.dueDate.slice(8, 10));
      const list = byDay.get(day) ?? [];
      list.push(item);
      byDay.set(day, list);
    }

    const cells: Array<{ day: number | null; items: CalendarInvoice[] }> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push({ day: null, items: [] });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day, items: byDay.get(day) ?? [] });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, items: [] });
    return cells;
  }, [calYear, calMonth, calendarItems]);

  const invoicePageData = useMemo(
    () => paginate(invoices, invoicePage, INVOICE_PAGE_SIZE),
    [invoices, invoicePage],
  );
  const inboxPageData = useMemo(
    () => paginate(inbox, inboxPage, INBOX_PAGE_SIZE),
    [inbox, inboxPage],
  );

  useEffect(() => {
    if (invoicePage !== invoicePageData.page) setInvoicePage(invoicePageData.page);
  }, [invoicePage, invoicePageData.page]);

  useEffect(() => {
    if (inboxPage !== inboxPageData.page) setInboxPage(inboxPageData.page);
  }, [inboxPage, inboxPageData.page]);

  if (!user || loading) {
    return (
      <main className="page">
        <div className="shell fade-up">
          <BrandMark />
          <DashboardSkeleton rows={5} />
        </div>
      </main>
    );
  }

  const hasLease = leases.length > 0;
  const hasInvoices = invoices.length > 0;
  const unpaid = invoices.filter(
    (inv) => inv.status !== 'PAID' && inv.status !== 'WAIVED',
  );
  const nextDue = [...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const outstandingTotal = unpaid.reduce((sum, inv) => sum + inv.amount, 0);

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(calYear, calMonth - 1 + delta, 1));
    setCalYear(date.getUTCFullYear());
    setCalMonth(date.getUTCMonth() + 1);
  }

  return (
    <main className="page">
      <div className="shell fade-up">
        <div className="topbar">
          <div>
            <BrandMark />
            <p className="eyebrow mt-4">Renter</p>
            <h1 className="mt-2 text-4xl md:text-5xl">What&apos;s due</h1>
            <p className="lead mt-3">
              Signed in as {user.fullName} · {user.email}
            </p>
          </div>
          <button type="button" onClick={logout} className="btn btn-ghost">
            Log out
          </button>
        </div>

        {error ? <p className="error-text mb-4">{error}</p> : null}

        {hasInvoices ? (
          <div className="summary-hero">
            <p className="eyebrow">This cycle</p>
            {nextDue ? (
              <>
                <h2>
                  <span className="amount">{formatPhp(nextDue.amount)}</span> due{' '}
                  <span className="mono">{nextDue.dueDate}</span>
                </h2>
                <p className="mt-2 mb-0 text-[var(--muted)]">
                  {nextDue.property.name} · {nextDue.unit.label}
                  {unpaid.length > 1
                    ? ` · ${formatPhp(outstandingTotal)} outstanding across ${unpaid.length} invoices`
                    : ''}
                </p>
              </>
            ) : (
              <>
                <h2>You&apos;re all caught up</h2>
                <p className="mt-2 mb-0 text-[var(--muted)]">No unpaid invoices right now.</p>
              </>
            )}
          </div>
        ) : null}

        {!hasLease || !hasInvoices ? (
          <div className="mb-5">
            <EmptyGuide
              title={hasLease ? 'Waiting on this month’s invoice' : 'Your lease isn’t linked yet'}
              intro={
                hasLease
                  ? 'Your landlord still needs to generate invoices. You’ll see dues here when they do.'
                  : 'Ask your landlord to assign a unit using this email address.'
              }
              steps={[
                {
                  title: 'Create your renter account',
                  body: 'You’re signed in — share this email with your landlord if needed.',
                  done: true,
                },
                {
                  title: 'Get assigned to a unit',
                  body: 'Landlord links your email to a unit and rent amount.',
                  done: hasLease,
                  current: !hasLease,
                },
                {
                  title: 'See what’s due',
                  body: 'Monthly invoices appear here with due dates and amounts.',
                  done: hasInvoices,
                  current: hasLease && !hasInvoices,
                },
                {
                  title: 'Submit payment proof',
                  body: 'Upload a receipt or note once you’ve paid.',
                  done: unpaid.length === 0 && hasInvoices,
                  current: hasInvoices && unpaid.length > 0,
                },
              ]}
            />
          </div>
        ) : null}

        <nav className="tab-row" aria-label="Renter dashboard">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-btn ${activeTab === tab.key ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'invoices' ? (
          <div className="dashboard-grid">
            <section className="panel" ref={invoicesRef}>
              <div className="section-head">
                <div>
                  <p className="eyebrow">Primary</p>
                  <h2 className="section-title">Invoices</h2>
                </div>
                {invoices.length > 0 ? (
                  <span className="badge mono">{invoices.length} total</span>
                ) : null}
              </div>
              {invoices.length === 0 ? (
                <p className="empty-copy">
                  No invoices yet. Your landlord generates monthly dues from your lease.
                </p>
              ) : (
                <>
                <ul className="space-y-3">
                  {invoicePageData.slice.map((invoice) => (
                    <li
                      key={invoice.id}
                      id={`invoice-${invoice.id}`}
                      className={`surface p-4 tracker-row ${highlightInvoiceId === invoice.id ? 'is-highlight' : ''}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="m-0 font-medium">
                            {invoice.property.name} · {invoice.unit.label}
                          </p>
                          <p className="mt-1 mb-0 text-sm text-[var(--muted)]">
                            {invoice.periodYear}-{String(invoice.periodMonth).padStart(2, '0')} · due{' '}
                            <span className="mono">{invoice.dueDate}</span> ·{' '}
                            <span className="mono">{formatPhp(invoice.amount)}</span>
                          </p>
                        </div>
                        <span className={statusClass(invoice.status)}>
                          <span className="status-dot" />
                          {invoice.status}
                        </span>
                      </div>

                      <LineBreakdown lines={invoice.lineItems} />

                      {invoice.status === 'PAID' ? (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <p className="m-0 text-sm text-[var(--ok)]">Paid — thank you.</p>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={Boolean(actionKey)}
                            onClick={async () => {
                              if (!token) return;
                              try {
                                await api.downloadReceipt(token, invoice.id);
                                toast('Receipt downloaded.', 'success');
                              } catch (err) {
                                toast(
                                  err instanceof Error ? err.message : 'Receipt failed',
                                  'error',
                                );
                              }
                            }}
                          >
                            Download receipt
                          </button>
                        </div>
                      ) : invoice.status === 'WAIVED' ? (
                        <p className="mt-4 mb-0 text-sm text-[var(--muted)]">Waived by landlord.</p>
                      ) : invoice.pendingPayment ? (
                        <p className="mt-4 mb-0 text-sm text-[var(--warn)]">
                          Payment submitted
                          {invoice.pendingPayment.hasProof ? ' with proof' : ''} — waiting for landlord
                          confirmation.
                        </p>
                      ) : (
                        <form
                          onSubmit={(e) => onSubmitPayment(e, invoice.id)}
                          className="mt-4 grid gap-3"
                        >
                          {token ? (
                            <GcashPayPanel
                              token={token}
                              propertyId={invoice.property.id}
                              propertyName={invoice.property.name}
                              amountLabel={formatPhp(invoice.amount)}
                              accountName={invoice.property.gcashAccountName}
                              mobileNumber={invoice.property.gcashMobileNumber}
                              hasQr={invoice.property.hasGcashQr}
                            />
                          ) : null}
                          <label className="field">
                            <span>Note (optional)</span>
                            <input
                              className="input"
                              value={notes[invoice.id] ?? ''}
                              onChange={(e) =>
                                setNotes((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                              }
                              placeholder="Paid via GCash / bank transfer…"
                            />
                          </label>
                          <label className="field">
                            <span>Proof of payment (JPG, PNG, WEBP, or PDF · max 5MB)</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                if (file && file.size > 5 * 1024 * 1024) {
                                  toast('Proof must be 5MB or smaller.', 'error');
                                  e.target.value = '';
                                  setFiles((prev) => ({ ...prev, [invoice.id]: null }));
                                  return;
                                }
                                setFiles((prev) => ({
                                  ...prev,
                                  [invoice.id]: file,
                                }));
                              }}
                              className="text-sm text-[var(--muted)] file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:font-semibold file:text-[#f7fbf9]"
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={Boolean(actionKey)}
                            className="btn btn-primary w-fit"
                          >
                            {actionKey === `pay-${invoice.id}`
                              ? 'Submitting…'
                              : 'Submit payment for review'}
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={invoicePageData.page}
                  pageSize={INVOICE_PAGE_SIZE}
                  total={invoices.length}
                  onPageChange={setInvoicePage}
                  label="invoices"
                />
                </>
              )}
            </section>

            <div className="space-y-3">
              <NotificationInbox
                items={inboxPageData.slice}
                emptyLabel="No reminders yet."
                markAllBusy={Boolean(actionKey)}
                onMarkAllRead={
                  token
                    ? async () => {
                        await api.markAllNotificationsRead(token);
                        await refresh(token);
                        toast('All notifications marked read.', 'success');
                      }
                    : undefined
                }
                onMarkOneRead={onMarkOneRead}
                onOpenItem={onOpenNotification}
              />
              <Pagination
                page={inboxPageData.page}
                pageSize={INBOX_PAGE_SIZE}
                total={inbox.length}
                onPageChange={setInboxPage}
                label="notifications"
              />
            </div>
          </div>
        ) : null}

        {activeTab === 'calendar' ? (
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Payment timing</p>
                <h2 className="section-title">{monthLabel(calYear, calMonth)}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)}>
                  Previous
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)}>
                  Next
                </button>
              </div>
            </div>

            <div className="pay-calendar" aria-label="Payment calendar">
              <div className="pay-calendar-weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="pay-calendar-grid">
                {calendarCells.map((cell, index) => (
                  <div
                    key={`${cell.day ?? 'pad'}-${index}`}
                    className={`pay-calendar-cell ${cell.day ? '' : 'is-empty'} ${
                      cell.items[0] ? `has-${cell.items[0].timing.toLowerCase().replace('_', '-')}` : ''
                    }`}
                  >
                    {cell.day ? (
                      <>
                        <span className="pay-calendar-day mono">{cell.day}</span>
                        {cell.items.map((item) => (
                          <span key={item.id} className={timingClass(item.timing)}>
                            {item.timing.replace('_', ' ')}
                          </span>
                        ))}
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="eyebrow">This month</p>
              {calendarItems.length === 0 ? (
                <p className="empty-copy">No invoices due this month.</p>
              ) : (
                <ul className="space-y-3">
                  {calendarItems.map((item) => (
                    <li key={item.id} className="surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="m-0 font-medium">
                            {item.property.name} · {item.unit.label}
                          </p>
                          <p className="mt-1 mb-0 text-sm text-[var(--muted)]">
                            Due <span className="mono">{item.dueDate}</span> ·{' '}
                            <span className="mono">{formatPhp(item.amount)}</span>
                          </p>
                        </div>
                        <span className={timingClass(item.timing)}>
                          {item.timing.replace('_', ' ')}
                        </span>
                      </div>
                      <LineBreakdown lines={item.lineItems} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'profile' ? (
          <div className="space-y-5">
            <section className="panel profile-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Account</p>
                  <h2 className="section-title">Profile</h2>
                </div>
              </div>
              <form onSubmit={onSaveProfile} className="grid gap-3 md:grid-cols-2">
                <label className="field">
                  <span>Full name</span>
                  <input
                    className="input"
                    required
                    minLength={2}
                    value={profileForm.fullName}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Email (read-only)</span>
                  <input className="input" value={user.email} disabled readOnly />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input
                    className="input"
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="09xxxxxxxxx"
                  />
                </label>
                <label className="field">
                  <span>Emergency contact name</span>
                  <input
                    className="input"
                    value={profileForm.emergencyContactName}
                    onChange={(e) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        emergencyContactName: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field md:col-span-2">
                  <span>Emergency contact phone</span>
                  <input
                    className="input"
                    value={profileForm.emergencyContactPhone}
                    onChange={(e) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        emergencyContactPhone: e.target.value,
                      }))
                    }
                    placeholder="09xxxxxxxxx"
                  />
                </label>
                <button
                  type="submit"
                  disabled={Boolean(actionKey)}
                  className="btn btn-primary md:col-span-2 md:w-fit"
                >
                  {actionKey === 'profile' ? 'Saving…' : 'Save profile'}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Lease</p>
                  <h2 className="section-title">My lease</h2>
                </div>
              </div>
              {leases.length === 0 ? (
                <p className="empty-copy">
                  No active lease yet. Ask your landlord to assign you using this email.
                </p>
              ) : (
                <div className="space-y-4">
                  {leases.map((lease) => (
                    <article key={lease.id} className="surface p-4">
                      <h3 className="m-0 text-xl">{lease.property.name}</h3>
                      <p className="mt-1 mb-0 text-sm text-[var(--muted)]">
                        {lease.property.address}
                      </p>
                      <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
                        <div>
                          <dt className="text-[var(--muted)]">Unit</dt>
                          <dd className="mt-1 font-medium">{lease.unit.label}</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--muted)]">Monthly rent</dt>
                          <dd className="mono mt-1 font-medium">
                            {formatPhp(lease.rentAmount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--muted)]">Due every</dt>
                          <dd className="mono mt-1 font-medium">Day {lease.dueDay}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        <p className="mt-10 text-sm text-[var(--muted)]">
          <Link href="/" className="nav-link">
            Back home
          </Link>
        </p>
      </div>

      <Celebrate payload={celebrate} onDone={() => setCelebrate(null)} />
    </main>
  );
}
