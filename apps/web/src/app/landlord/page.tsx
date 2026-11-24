'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  type AuditEvent,
  type AuthUser,
  type PaymentReviewItem,
  type PropertyWithUnits,
  type TrackerInvoice,
  type TrackerResponse,
} from '@/lib/api';
import { AppShell } from '@/components/app-shell';
import { BrandMark } from '@/components/brand-mark';
import { Celebrate, type CelebratePayload } from '@/components/celebrate';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyGuide } from '@/components/empty-guide';
import { NotificationInbox, type InboxItem } from '@/components/notification-inbox';
import { Pagination, paginate } from '@/components/pagination';
import { PartialPayDialog } from '@/components/partial-pay-dialog';
import { ProofModal } from '@/components/proof-modal';
import { DashboardSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { clearSession, getStoredUser, getToken } from '@/lib/auth-storage';
import { statusClass } from '@/lib/status';

type Tab = 'tracker' | 'proofs' | 'properties' | 'inbox' | 'activity';
type TrackerFilter = 'ALL' | 'DUE' | 'OVERDUE' | 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
type LeaseForm = { renterEmail: string; rentAmount: string; dueDay: string };
type AmendForm = { rentAmount: string; dueDay: string };
type PropertySection = 'utilities' | 'gcash' | 'units';

const pageTitles: Record<Tab, string> = {
  tracker: 'Collection board',
  proofs: 'Payment proofs',
  properties: 'Properties',
  inbox: 'Inbox',
  activity: 'Activity',
};

function AccordionSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`accordion ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="accordion-trigger"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="accordion-trigger-text">
          <span className="eyebrow">{title}</span>
          {summary ? <span className="accordion-summary">{summary}</span> : null}
        </span>
        <span className="accordion-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <div className="accordion-body">{children}</div> : null}
    </div>
  );
}

type ConfirmState =
  | { kind: 'markPaid'; invoiceId: string; label: string }
  | { kind: 'reject'; paymentId: string; label: string }
  | { kind: 'confirm'; paymentId: string; label: string }
  | { kind: 'endLease'; unitId: string; label: string }
  | { kind: 'waive'; invoiceId: string; label: string }
  | null;

const trackerFilters: { key: TrackerFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DUE', label: 'Due' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PARTIAL', label: 'Partial' },
  { key: 'PAID', label: 'Paid' },
  { key: 'WAIVED', label: 'Waived' },
];

function formatPhp(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function matchesFilter(item: TrackerInvoice, filter: TrackerFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'PENDING') return Boolean(item.pendingPayment);
  return item.status === filter;
}

function includesSearch(values: Array<string | undefined>, query: string) {
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

export default function LandlordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const trackerRef = useRef<HTMLElement | null>(null);
  const proofsRef = useRef<HTMLElement | null>(null);
  const now = useMemo(() => new Date(), []);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [properties, setProperties] = useState<PropertyWithUnits[]>([]);
  const [tracker, setTracker] = useState<TrackerResponse | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PaymentReviewItem[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('tracker');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrackerFilter>('ALL');
  const [generateYear, setGenerateYear] = useState(now.getFullYear());
  const [generateMonth, setGenerateMonth] = useState(now.getMonth() + 1);
  const [highlightInvoiceId, setHighlightInvoiceId] = useState<string | null>(null);
  const [highlightPaymentId, setHighlightPaymentId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [partialItem, setPartialItem] = useState<TrackerInvoice | null>(null);

  const [proofPayment, setProofPayment] = useState<PaymentReviewItem | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofKind, setProofKind] = useState<'image' | 'pdf' | 'unknown' | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [unitLabels, setUnitLabels] = useState<Record<string, string>>({});
  const [leaseForms, setLeaseForms] = useState<Record<string, LeaseForm>>({});
  const [amendForms, setAmendForms] = useState<Record<string, AmendForm>>({});
  const [gcashForms, setGcashForms] = useState<
    Record<string, { accountName: string; mobile: string; qr: File | null }>
  >({});
  const [utilityForms, setUtilityForms] = useState<
    Record<string, { name: string; unitLabel: string; unitRate: string }>
  >({});
  const [utilityRateEdits, setUtilityRateEdits] = useState<Record<string, string>>({});
  const [lineDrafts, setLineDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  const [openProperties, setOpenProperties] = useState<Record<string, boolean>>({});
  const [openPropertySections, setOpenPropertySections] = useState<
    Record<string, Partial<Record<PropertySection, boolean>>>
  >({});
  const [trackerPage, setTrackerPage] = useState(1);
  const [propertyPage, setPropertyPage] = useState(1);
  const [proofsPage, setProofsPage] = useState(1);
  const [inboxPage, setInboxPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [celebrate, setCelebrate] = useState<CelebratePayload>(null);

  const refresh = useCallback(async (authToken: string) => {
    const [list, trackerData, pending, notifications, events] = await Promise.all([
      api.listProperties(authToken),
      api.getTracker(authToken),
      api.listPendingPayments(authToken),
      api.listNotifications(authToken),
      api.listAudit(authToken),
    ]);
    setProperties(list);
    setTracker(trackerData);
    setPendingPayments(pending);
    setInbox(notifications);
    setAudit(events);
  }, []);

  useEffect(() => {
    const authToken = getToken();
    const stored = getStoredUser();
    if (!authToken || !stored) {
      router.replace('/login');
      return;
    }
    if (stored.role !== 'LANDLORD') {
      router.replace('/renter');
      return;
    }
    setUser(stored);
    setToken(authToken);
    api.me(authToken).then(setUser).catch(() => {
      clearSession();
      router.replace('/login');
    });
    setLoading(true);
    refresh(authToken)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [refresh, router]);

  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    };
  }, [proofUrl]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => {
    if (!tracker) return [];
    return tracker.items.filter(
      (item) =>
        matchesFilter(item, filter) &&
        (!normalizedSearch ||
          includesSearch(
            [item.renter.fullName, item.renter.email, item.unit.label, item.property.name],
            normalizedSearch,
          )),
    );
  }, [filter, normalizedSearch, tracker]);

  const filteredProperties = useMemo(() => {
    if (!normalizedSearch) return properties;
    return properties.flatMap((property) => {
      if (includesSearch([property.name], normalizedSearch)) return [property];
      const units = property.units.filter((unit) =>
        includesSearch(
          [
            unit.label,
            unit.activeLease?.renter?.fullName,
            unit.activeLease?.renter?.email,
            ...(unit.leaseHistory ?? []).flatMap((lease) => [
              lease.renter?.fullName,
              lease.renter?.email,
            ]),
          ],
          normalizedSearch,
        ),
      );
      return units.length ? [{ ...property, units }] : [];
    });
  }, [normalizedSearch, properties]);

  const TRACKER_PAGE_SIZE = 8;
  const PROPERTY_PAGE_SIZE = 5;
  const LIST_PAGE_SIZE = 8;

  const trackerPageData = useMemo(
    () => paginate(filteredItems, trackerPage, TRACKER_PAGE_SIZE),
    [filteredItems, trackerPage],
  );
  const propertyPageData = useMemo(
    () => paginate(filteredProperties, propertyPage, PROPERTY_PAGE_SIZE),
    [filteredProperties, propertyPage],
  );
  const proofsPageData = useMemo(
    () => paginate(pendingPayments, proofsPage, LIST_PAGE_SIZE),
    [pendingPayments, proofsPage],
  );
  const inboxPageData = useMemo(
    () => paginate(inbox, inboxPage, LIST_PAGE_SIZE),
    [inbox, inboxPage],
  );
  const activityPageData = useMemo(
    () => paginate(audit, activityPage, LIST_PAGE_SIZE),
    [audit, activityPage],
  );

  useEffect(() => {
    setTrackerPage(1);
  }, [filter, normalizedSearch]);

  useEffect(() => {
    setPropertyPage(1);
  }, [normalizedSearch]);

  useEffect(() => {
    if (trackerPage !== trackerPageData.page) setTrackerPage(trackerPageData.page);
  }, [trackerPage, trackerPageData.page]);

  useEffect(() => {
    if (propertyPage !== propertyPageData.page) setPropertyPage(propertyPageData.page);
  }, [propertyPage, propertyPageData.page]);

  useEffect(() => {
    if (proofsPage !== proofsPageData.page) setProofsPage(proofsPageData.page);
  }, [proofsPage, proofsPageData.page]);

  useEffect(() => {
    if (inboxPage !== inboxPageData.page) setInboxPage(inboxPageData.page);
  }, [inboxPage, inboxPageData.page]);

  useEffect(() => {
    if (activityPage !== activityPageData.page) setActivityPage(activityPageData.page);
  }, [activityPage, activityPageData.page]);

  const hasUnit = properties.some((property) => property.units.length > 0);
  const hasLease = properties.some((property) => property.units.some((unit) => unit.activeLease));
  const hasInvoices = Boolean(tracker?.items.length);
  const yearOptions = Array.from({ length: 7 }, (_, index) => now.getFullYear() - 2 + index);

  function logout() {
    clearSession();
    router.push('/login');
  }

  function busy(key: string) {
    return actionKey === key;
  }

  function isPropertyOpen(propertyId: string) {
    return openProperties[propertyId] ?? false;
  }

  function toggleProperty(propertyId: string) {
    setOpenProperties((previous) => ({
      ...previous,
      [propertyId]: !(previous[propertyId] ?? false),
    }));
  }

  function isSectionOpen(propertyId: string, section: PropertySection) {
    const value = openPropertySections[propertyId]?.[section];
    if (value !== undefined) return value;
    return section === 'units';
  }

  function toggleSection(propertyId: string, section: PropertySection) {
    setOpenPropertySections((previous) => {
      const current = previous[propertyId]?.[section];
      const open = current !== undefined ? current : section === 'units';
      return {
        ...previous,
        [propertyId]: {
          ...(previous[propertyId] ?? {}),
          [section]: !open,
        },
      };
    });
  }

  async function runAction(key: string, work: () => Promise<void>, successMsg?: string) {
    if (!token) return false;
    setActionKey(key);
    setError(null);
    try {
      await work();
      await refresh(token);
      if (successMsg) toast(successMsg, 'success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      toast(message, 'error');
      return false;
    } finally {
      setActionKey(null);
    }
  }

  async function onGenerateInvoices() {
    if (!token) return;
    setActionKey('generate');
    setError(null);
    try {
      const result = await api.generateInvoices(token, {
        year: generateYear,
        month: generateMonth,
      });
      await refresh(token);
      toast(
        result.created
          ? `Generated ${result.created} invoice${result.created === 1 ? '' : 's'}.`
          : `No new invoices — ${result.skipped} already existed for this period.`,
        result.created ? 'success' : 'info',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate invoices';
      setError(message);
      toast(message, 'error');
    } finally {
      setActionKey(null);
    }
  }

  async function onRunReminders() {
    if (!token) return;
    setActionKey('reminders');
    try {
      const result = await api.runReminders(token);
      await refresh(token);
      toast(result.message, 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send reminders';
      setError(message);
      toast(message, 'error');
    } finally {
      setActionKey(null);
    }
  }

  async function executeConfirm() {
    if (!confirm || !token) return;
    const current = confirm;
    setConfirm(null);
    if (current.kind === 'markPaid') {
      const ok = await runAction(
        `paid-${current.invoiceId}`,
        async () => void (await api.markInvoicePaid(token, current.invoiceId)),
        'Marked as paid.',
      );
      if (ok) {
        setCelebrate({
          title: 'Paid in full!',
          subtitle: current.label,
        });
      }
    } else if (current.kind === 'waive') {
      await runAction(
        `waive-${current.invoiceId}`,
        async () => void (await api.waiveInvoice(token, current.invoiceId)),
        'Invoice waived.',
      );
    } else if (current.kind === 'confirm') {
      closeProofModal();
      const ok = await runAction(
        `confirm-${current.paymentId}`,
        async () => void (await api.confirmPayment(token, current.paymentId)),
        'Payment confirmed.',
      );
      if (ok) {
        setCelebrate({
          title: 'Payment confirmed!',
          subtitle: current.label,
        });
      }
    } else if (current.kind === 'reject') {
      closeProofModal();
      await runAction(
        `reject-${current.paymentId}`,
        async () => void (await api.rejectPayment(token, current.paymentId)),
        'Payment rejected.',
      );
    } else {
      await runAction(
        `end-lease-${current.unitId}`,
        async () => void (await api.endLease(token, current.unitId)),
        'Lease ended — unit is vacant.',
      );
    }
  }

  function closeProofModal() {
    setProofPayment(null);
    setProofKind(null);
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    setProofUrl(null);
  }

  async function openProofModal(payment: PaymentReviewItem) {
    if (!token) return;
    setProofPayment(payment);
    setProofLoading(true);
    setProofUrl(null);
    setProofKind(null);
    setHighlightPaymentId(payment.id);
    try {
      if (!payment.hasProof) return;
      const response = await fetch(api.proofUrl(payment.id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not load proof');
      const blob = await response.blob();
      setProofUrl(URL.createObjectURL(blob));
      setProofKind(blob.type.startsWith('image/') ? 'image' : blob.type === 'application/pdf' ? 'pdf' : 'unknown');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load proof', 'error');
    } finally {
      setProofLoading(false);
    }
  }

  async function onCreateProperty(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    await runAction(
      'create-property',
      async () => {
        await api.createProperty(token, { name: propertyName, address: propertyAddress });
        setPropertyName('');
        setPropertyAddress('');
      },
      'Property created.',
    );
  }

  async function onCreateUnit(propertyId: string) {
    if (!token) return;
    const label = unitLabels[propertyId]?.trim();
    if (!label) return;
    await runAction(
      `unit-${propertyId}`,
      async () => {
        await api.createUnit(token, propertyId, { label });
        setUnitLabels((previous) => ({ ...previous, [propertyId]: '' }));
      },
      'Unit added.',
    );
  }

  async function onSaveGcash(propertyId: string) {
    if (!token) return;
    const property = properties.find((item) => item.id === propertyId);
    const form = gcashForms[propertyId] ?? {
      accountName: property?.gcashAccountName ?? '',
      mobile: property?.gcashMobileNumber ?? '',
      qr: null,
    };
    await runAction(
      `gcash-${propertyId}`,
      async () => {
        await api.updatePropertyGcash(token, propertyId, {
          gcashAccountName: form.accountName,
          gcashMobileNumber: form.mobile,
          qr: form.qr,
        });
        setGcashForms((previous) => ({
          ...previous,
          [propertyId]: { ...form, qr: null },
        }));
      },
      'GCash payment details saved.',
    );
  }

  async function onAddUtility(propertyId: string) {
    if (!token) return;
    const form = utilityForms[propertyId] ?? { name: '', unitLabel: 'kWh', unitRate: '' };
    const name = form.name.trim();
    const unitLabel = form.unitLabel.trim() || 'unit';
    const unitRate = Number(form.unitRate);
    if (!name) {
      toast('Enter a utility name.', 'error');
      return;
    }
    if (!Number.isFinite(unitRate) || unitRate < 0) {
      toast('Enter a rate like 15.06.', 'error');
      return;
    }
    await runAction(
      `utility-add-${propertyId}`,
      async () => {
        await api.createUtility(token, propertyId, { name, unitLabel, unitRate });
        setUtilityForms((previous) => ({
          ...previous,
          [propertyId]: { name: '', unitLabel: 'kWh', unitRate: '' },
        }));
      },
      `Added “${name}” @ ₱${unitRate}/${unitLabel}.`,
    );
  }

  async function onSaveUtilityRate(utilityTypeId: string, fallbackRate: number) {
    if (!token) return;
    const raw = utilityRateEdits[utilityTypeId] ?? String(fallbackRate);
    const unitRate = Number(raw);
    if (!Number.isFinite(unitRate) || unitRate < 0) {
      toast('Enter a valid rate.', 'error');
      return;
    }
    await runAction(
      `utility-rate-${utilityTypeId}`,
      async () => {
        await api.updateUtility(token, utilityTypeId, { unitRate });
        setUtilityRateEdits((previous) => {
          const next = { ...previous };
          delete next[utilityTypeId];
          return next;
        });
      },
      `Rate updated to ₱${unitRate}. Unpaid invoices will recalculate.`,
    );
  }

  async function onToggleUtility(utilityTypeId: string, active: boolean) {
    if (!token) return;
    await runAction(
      `utility-${utilityTypeId}`,
      async () => void (await api.updateUtility(token, utilityTypeId, { active })),
      active ? 'Utility re-enabled.' : 'Utility deactivated.',
    );
  }

  async function onRemoveUtility(utilityTypeId: string) {
    if (!token) return;
    await runAction(
      `utility-del-${utilityTypeId}`,
      async () => void (await api.deleteUtility(token, utilityTypeId)),
      'Utility removed from catalog.',
    );
  }

  function ensureLineDraft(item: TrackerInvoice) {
    if (lineDrafts[item.id] || !item.lineItems?.length) return;
    const draft: Record<string, string> = {};
    for (const line of item.lineItems) {
      if (line.kind === 'UTILITY') {
        draft[line.id] = String(line.quantity ?? 0);
      }
    }
    setLineDrafts((previous) => ({ ...previous, [item.id]: draft }));
  }

  async function onSaveInvoiceLines(item: TrackerInvoice) {
    if (!token || !item.lineItems?.length) return;
    const draft = lineDrafts[item.id];
    if (!draft) return;
    const utils = item.lineItems.filter((line) => line.kind === 'UTILITY');
    const lines = utils.map((line) => ({
      id: line.id,
      quantity: Number(draft[line.id] ?? line.quantity ?? 0),
    }));
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 0)) {
      toast('Consumption must be zero or more.', 'error');
      return;
    }
    await runAction(
      `lines-${item.id}`,
      async () => {
        await api.updateInvoiceLines(token, item.id, lines);
        setExpandedLines((previous) => ({ ...previous, [item.id]: false }));
      },
      'Utility consumption saved.',
    );
  }

  function toggleUtilityPanel(item: TrackerInvoice) {
    ensureLineDraft(item);
    setExpandedLines((previous) => ({
      ...previous,
      [item.id]: !previous[item.id],
    }));
  }

  function renderUtilityToggle(item: TrackerInvoice) {
    const utils = item.lineItems?.filter((line) => line.kind === 'UTILITY') ?? [];
    if (!item.lineItems?.length) return null;
    const open = expandedLines[item.id];
    const editable = item.status !== 'PAID' && item.status !== 'WAIVED' && item.status !== 'PARTIAL';
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm utility-toggle"
        onClick={() => toggleUtilityPanel(item)}
      >
        {open
          ? 'Hide'
          : editable
            ? utils.length
              ? `Edit utilities (${utils.length})`
              : 'Utilities'
            : utils.length
              ? `View utilities (${utils.length})`
              : 'Utilities'}
      </button>
    );
  }

  function renderUtilityPanel(item: TrackerInvoice) {
    if (!expandedLines[item.id] || !item.lineItems?.length) return null;

    const editable = item.status !== 'PAID' && item.status !== 'WAIVED';
    const draft = lineDrafts[item.id];
    const rent = item.lineItems.find((line) => line.kind === 'RENT');
    const utils = item.lineItems.filter((line) => line.kind === 'UTILITY');
    const utilTotal = utils.reduce((sum, line) => {
      const qty = Number(draft?.[line.id] ?? line.quantity ?? 0);
      const rate = Number(line.unitRate ?? 0);
      return sum + Math.round(rate * (Number.isFinite(qty) ? qty : 0));
    }, 0);
    const rentAmount = rent?.amount ?? 0;

    return (
      <div className="utility-panel">
        <div className="utility-panel-head">
          <div>
            <p className="eyebrow">This month’s bill</p>
            <p className="utility-panel-total mono">
              {formatPhp(rentAmount + utilTotal)}
            </p>
          </div>
          <dl className="utility-panel-summary">
            <div>
              <dt>Rent</dt>
              <dd className="mono">{formatPhp(rentAmount)}</dd>
            </div>
            <div>
              <dt>Utilities</dt>
              <dd className="mono">{formatPhp(utilTotal)}</dd>
            </div>
          </dl>
        </div>

        {utils.length === 0 ? (
          <p className="empty-copy mb-0">
            No utility lines yet. Add Electricity/Water under Properties, then refresh.
          </p>
        ) : (
          <div className="utility-grid">
            {utils.map((line) => {
              const qty = Number(draft?.[line.id] ?? line.quantity ?? 0);
              const rate = Number(line.unitRate ?? 0);
              const computed = Math.round(rate * (Number.isFinite(qty) ? qty : 0));
              const unit = line.unitLabel && line.unitLabel !== 'unit' ? line.unitLabel : 'unit';
              return (
                <article key={line.id} className="utility-card">
                  <div className="utility-card-top">
                    <h4>{line.label}</h4>
                    <p className="mono">
                      {rate > 0 ? `₱${rate.toFixed(2)} / ${unit}` : 'Rate not set'}
                    </p>
                  </div>
                  {rate <= 0 ? (
                    <p className="utility-card-hint">
                      Set a rate under Properties before charging this utility.
                    </p>
                  ) : null}
                  <label className="field">
                    <span>Consumption ({unit})</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={!editable || Boolean(actionKey) || rate <= 0}
                      value={draft?.[line.id] ?? String(line.quantity ?? 0)}
                      onChange={(event) =>
                        setLineDrafts((previous) => ({
                          ...previous,
                          [item.id]: {
                            ...(previous[item.id] ?? {}),
                            [line.id]: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <p className="utility-card-calc mono">
                    ₱{rate.toFixed(2)} × {Number.isFinite(qty) ? qty : 0} {unit} ={' '}
                    <strong>{formatPhp(computed)}</strong>
                  </p>
                </article>
              );
            })}
          </div>
        )}

        {editable && utils.length > 0 ? (
          <div className="utility-panel-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={Boolean(actionKey)}
              onClick={() => onSaveInvoiceLines(item)}
            >
              {busy(`lines-${item.id}`) ? 'Saving…' : 'Save consumption'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setExpandedLines((previous) => ({ ...previous, [item.id]: false }))
              }
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  async function onCreateLease(unitId: string) {
    if (!token) return;
    const form = leaseForms[unitId];
    if (!form) return;
    await runAction(
      `lease-${unitId}`,
      async () => {
        await api.createLease(token, unitId, {
          renterEmail: form.renterEmail,
          rentAmount: Number(form.rentAmount),
          dueDay: Number(form.dueDay),
        });
        setLeaseForms((previous) => ({
          ...previous,
          [unitId]: { renterEmail: '', rentAmount: '', dueDay: '5' },
        }));
      },
      'Renter assigned.',
    );
  }

  async function onUpdateLease(leaseId: string, current: AmendForm) {
    if (!token) return;
    await runAction(
      `amend-${leaseId}`,
      async () =>
        void (await api.updateLease(token, leaseId, {
          rentAmount: Number(current.rentAmount),
          dueDay: Number(current.dueDay),
        })),
      'Lease terms updated.',
    );
  }

  async function onSubmitPartial(paidAmount: number) {
    if (!token || !partialItem) return;
    const item = partialItem;
    await runAction(
      `partial-${item.id}`,
      async () => {
        await api.partialPayInvoice(token, item.id, paidAmount);
        setPartialItem(null);
      },
      `Recorded ${formatPhp(paidAmount)} partial payment.`,
    );
  }

  async function onDownloadReceipt(item: TrackerInvoice) {
    if (!token) return;
    setActionKey(`receipt-${item.id}`);
    try {
      await api.downloadReceipt(token, item.id);
      toast('Receipt opened — use Print / Save PDF.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Receipt download failed', 'error');
    } finally {
      setActionKey(null);
    }
  }

  async function onSeedDemo() {
    if (!token) return;
    setActionKey('seed-demo');
    try {
      const result = await api.seedDemo(token);
      await refresh(token);
      toast(
        `Demo renter: ${result.demoRenter.email} / ${result.demoRenter.password}`,
        'success',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create demo data';
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
        // Navigation remains useful even when marking the notification fails.
      }
    }
    if (item.type === 'PAYMENT_SUBMITTED') {
      const payment =
        pendingPayments.find((candidate) => candidate.invoiceId === item.relatedInvoiceId) ??
        pendingPayments.find((candidate) => item.title.includes(candidate.renter.fullName));
      setActiveTab('proofs');
      if (payment) {
        setHighlightPaymentId(payment.id);
        await openProofModal(payment);
      }
      requestAnimationFrame(() => proofsRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } else {
      setActiveTab('tracker');
      setFilter('ALL');
      if (item.relatedInvoiceId) setHighlightInvoiceId(item.relatedInvoiceId);
      requestAnimationFrame(() => trackerRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  function renderInvoiceActions(item: TrackerInvoice) {
    const utilities = renderUtilityToggle(item);

    if (item.status === 'PAID') {
      return (
        <div className="tracker-actions">
          <button
            type="button"
            disabled={Boolean(actionKey)}
            onClick={() => onDownloadReceipt(item)}
            className="btn btn-ghost btn-sm"
          >
            {busy(`receipt-${item.id}`) ? 'Downloading…' : 'Receipt'}
          </button>
          {utilities}
        </div>
      );
    }
    if (item.status === 'WAIVED') {
      return (
        <div className="tracker-actions">
          <span className="text-[var(--muted)]">—</span>
          {utilities}
        </div>
      );
    }
    if (item.pendingPayment) {
      return (
        <div className="tracker-actions">
          <span className="text-xs text-[var(--muted)]">See pending</span>
          {utilities}
        </div>
      );
    }
    return (
      <div className="tracker-actions">
        <button
          type="button"
          disabled={Boolean(actionKey)}
          onClick={() =>
            setConfirm({
              kind: 'markPaid',
              invoiceId: item.id,
              label: `${item.renter.fullName} · ${formatPhp(item.amount)}`,
            })
          }
          className="btn btn-primary btn-sm"
        >
          Mark paid
        </button>
        <button
          type="button"
          disabled={Boolean(actionKey)}
          onClick={() => setPartialItem(item)}
          className="btn btn-ghost btn-sm"
        >
          Partial
        </button>
        <button
          type="button"
          disabled={Boolean(actionKey)}
          onClick={() =>
            setConfirm({
              kind: 'waive',
              invoiceId: item.id,
              label: `${item.renter.fullName} · ${formatPhp(item.amount)}`,
            })
          }
          className="btn btn-ghost btn-sm"
        >
          Waive
        </button>
        {utilities}
      </div>
    );
  }

  if (!user || loading) {
    return (
      <main className="page">
        <div className="shell fade-up">
          <BrandMark />
          <DashboardSkeleton rows={6} />
        </div>
      </main>
    );
  }

  const unreadInbox = inbox.filter((item) => !item.readAt).length;

  return (
    <>
      <AppShell
        roleLabel="Landlord workspace"
        title={pageTitles[activeTab]}
        subtitle={`Signed in as ${user.fullName} · ${user.email}`}
        activeKey={activeTab}
        onNavigate={(key) => setActiveTab(key as Tab)}
        onLogout={logout}
        groups={[
          {
            label: 'Overview',
            items: [{ key: 'tracker', label: 'Tracker' }],
          },
          {
            label: 'Money',
            items: [
              {
                key: 'proofs',
                label: 'Proofs',
                badge: pendingPayments.length || undefined,
              },
              { key: 'activity', label: 'Activity' },
            ],
          },
          {
            label: 'Setup',
            items: [{ key: 'properties', label: 'Properties' }],
          },
          {
            label: 'Comms',
            items: [
              {
                key: 'inbox',
                label: 'Inbox',
                badge: unreadInbox || undefined,
              },
            ],
          },
        ]}
      >
        {error ? <p className="error-text mb-4">{error}</p> : null}
        {!hasInvoices ? (
          <div className="mb-5">
            <EmptyGuide
              title="Set up your first collection cycle"
              intro="Follow these steps once. After that, generate invoices each month and review proofs here."
              steps={[
                { title: 'Add a property', body: 'Name and address for the building or house you manage.', done: properties.length > 0, current: properties.length === 0 },
                { title: 'Add a unit', body: 'Create Unit 1A, Studio, etc. under that property.', done: hasUnit, current: properties.length > 0 && !hasUnit },
                { title: 'Assign a renter', body: 'Use their account email, rent amount, and due day.', done: hasLease, current: hasUnit && !hasLease },
                { title: 'Generate invoices', body: 'Create this month’s dues, then track collection status.', done: hasInvoices, current: hasLease && !hasInvoices },
              ]}
            />
          </div>
        ) : null}

        {(activeTab === 'tracker' || activeTab === 'properties') ? (
          <div className="search-bar">
            <input
              className="input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search renter, email, unit, or property"
              aria-label="Search dashboard"
            />
          </div>
        ) : null}

        {activeTab === 'tracker' ? (
          <>
          <div className="overview-grid">
            {[
              {
                label: 'Overdue',
                value: String(tracker?.summary.overdue ?? 0),
                hint: 'Need follow-up',
              },
              {
                label: 'Due',
                value: String(tracker?.summary.due ?? 0),
                hint: 'Open this cycle',
              },
              {
                label: 'Pending proofs',
                value: String(pendingPayments.length),
                hint: 'Awaiting review',
              },
              {
                label: 'Paid',
                value: String(tracker?.summary.paid ?? 0),
                hint: 'Confirmed this view',
              },
            ].map((card) => (
              <article key={card.label} className="overview-card">
                <p className="eyebrow">{card.label}</p>
                <p className="overview-value mono">{card.value}</p>
                <p className="overview-hint">{card.hint}</p>
              </article>
            ))}
          </div>
          <section className="panel" ref={trackerRef}>
            <div className="section-head">
              <div><p className="eyebrow">Primary</p><h2 className="section-title">Payment tracker</h2></div>
              <button type="button" disabled={Boolean(actionKey)} onClick={onRunReminders} className="btn btn-ghost btn-sm">
                {busy('reminders') ? 'Sending…' : 'Send reminders'}
              </button>
            </div>
            <div className="period-row">
              <label className="field">
                <span>Year</span>
                <select className="input" value={generateYear} onChange={(event) => setGenerateYear(Number(event.target.value))}>
                  {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Month</span>
                <select className="input" value={generateMonth} onChange={(event) => setGenerateMonth(Number(event.target.value))}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {new Date(2000, index, 1).toLocaleString('en-PH', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field period-row-action">
                <span className="period-action-spacer" aria-hidden="true">
                  Year
                </span>
                <button
                  type="button"
                  disabled={Boolean(actionKey)}
                  onClick={onGenerateInvoices}
                  className="btn btn-primary period-generate-btn"
                >
                  {busy('generate') ? 'Generating…' : 'Generate invoices'}
                </button>
              </div>
            </div>

            {tracker ? (
              <>
                <div className="stat-grid mb-4">
                  {([
                    ['ALL', 'Total', tracker.summary.total],
                    ['DUE', 'Due', tracker.summary.due],
                    ['OVERDUE', 'Overdue', tracker.summary.overdue],
                    ['PENDING', 'Pending', tracker.summary.pendingReview],
                    ['PARTIAL', 'Partial', tracker.summary.partial ?? 0],
                    ['PAID', 'Paid', tracker.summary.paid],
                    ['WAIVED', 'Waived', tracker.summary.waived ?? 0],
                  ] as const).map(([key, label, value]) => (
                    <button key={key} type="button" className={`stat ${filter === key ? 'is-active' : ''}`} onClick={() => setFilter(key)}>
                      <p>{label}</p><p>{value}</p>
                    </button>
                  ))}
                </div>
                <div className="filter-row">
                  {trackerFilters.map(({ key, label }) => (
                    <button key={key} type="button" className={`filter-chip ${filter === key ? 'is-active' : ''}`} onClick={() => setFilter(key)}>
                      {label}
                    </button>
                  ))}
                </div>

                {filteredItems.length === 0 ? <p className="empty-copy">No invoices match this view.</p> : (
                  <>
                    <div className="table-wrap tracker-desktop">
                      <table className="data-table">
                        <thead><tr><th>Renter</th><th>Unit</th><th>Period</th><th>Amount</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                          {trackerPageData.slice.map((item) => (
                            <Fragment key={item.id}>
                              <tr id={`invoice-${item.id}`} className={`tracker-row ${highlightInvoiceId === item.id ? 'row-highlight' : ''}`}>
                                <td><div>{item.renter.fullName}</div><div className="text-xs text-[var(--muted)]">{item.renter.email}</div></td>
                                <td>{item.property.name} · {item.unit.label}</td>
                                <td className="mono">{item.periodYear}-{String(item.periodMonth).padStart(2, '0')}</td>
                                <td>
                                  <div className="amount-stack">
                                    <span className="mono amount-cell">{formatPhp(item.amount)}</span>
                                    {item.status === 'PARTIAL' ? (
                                      <span className="amount-remaining">
                                        Remaining
                                        {item.amountPaid
                                          ? ` · paid ${formatPhp(item.amountPaid)} of ${formatPhp(item.originalAmount ?? item.amount + item.amountPaid)}`
                                          : ''}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="mono">{item.dueDate}</td>
                                <td>
                                  <span className={statusClass(item.status)}><span className="status-dot" />{item.status}</span>
                                  {item.pendingPayment ? <div className="mt-1 text-xs text-[var(--warn)]">Awaiting review</div> : null}
                                </td>
                                <td>{renderInvoiceActions(item)}</td>
                              </tr>
                              {expandedLines[item.id] ? (
                                <tr className="utility-expand-row">
                                  <td colSpan={7}>{renderUtilityPanel(item)}</td>
                                </tr>
                              ) : null}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="tracker-mobile">
                      {trackerPageData.slice.map((item) => (
                        <article key={item.id} id={`invoice-card-${item.id}`} className={`invoice-card tracker-row ${highlightInvoiceId === item.id ? 'is-highlight' : ''}`}>
                          <div className="invoice-card-top">
                            <div><p className="m-0 font-medium">{item.renter.fullName}</p><p className="mt-1 mb-0 text-sm text-[var(--muted)]">{item.property.name} · {item.unit.label}</p></div>
                            <span className={statusClass(item.status)}><span className="status-dot" />{item.status}</span>
                          </div>
                          <p className="invoice-card-meta mono">
                            {item.periodYear}-{String(item.periodMonth).padStart(2, '0')} · due{' '}
                            {item.dueDate} · {formatPhp(item.amount)}
                            {item.status === 'PARTIAL'
                              ? ` remaining${item.amountPaid ? ` · paid ${formatPhp(item.amountPaid)}` : ''}`
                              : ''}
                          </p>
                          <div className="invoice-card-actions">{renderInvoiceActions(item)}</div>
                          {expandedLines[item.id] ? (
                            <div className="utility-panel-inline">{renderUtilityPanel(item)}</div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                    <Pagination
                      page={trackerPageData.page}
                      pageSize={TRACKER_PAGE_SIZE}
                      total={filteredItems.length}
                      onPageChange={setTrackerPage}
                      label="invoices"
                    />
                  </>
                )}
              </>
            ) : <p className="empty-copy">Loading tracker…</p>}
          </section>
          </>
        ) : null}

        {activeTab === 'proofs' ? (
          <section className="panel" ref={proofsRef}>
            <div className="section-head">
              <div><p className="eyebrow">Action queue</p><h2 className="section-title">Payment proofs</h2></div>
              {pendingPayments.length ? <span className="badge badge-accent mono">{pendingPayments.length} waiting</span> : null}
            </div>
            {pendingPayments.length === 0 ? <p className="empty-copy">No pending payment proofs.</p> : (
              <>
              <ul className="space-y-3">
                {proofsPageData.slice.map((payment) => (
                  <li key={payment.id} className={`surface p-4 tracker-row ${highlightPaymentId === payment.id ? 'is-highlight' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="m-0 font-medium">{payment.renter.fullName} · {payment.property.name} · {payment.unit.label}</p>
                        <p className="mt-1 mb-0 text-sm text-[var(--muted)]">{payment.invoice.periodYear}-{String(payment.invoice.periodMonth).padStart(2, '0')} · <span className="mono">{formatPhp(payment.amount)}</span>{payment.note ? ` · “${payment.note}”` : ''}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openProofModal(payment)} className="btn btn-ghost btn-sm">{payment.hasProof ? 'Review proof' : 'Review'}</button>
                        <button type="button" disabled={Boolean(actionKey)} onClick={() => setConfirm({ kind: 'confirm', paymentId: payment.id, label: `${payment.renter.fullName} · ${formatPhp(payment.amount)}` })} className="btn btn-primary btn-sm">Confirm paid</button>
                        <button type="button" disabled={Boolean(actionKey)} onClick={() => setConfirm({ kind: 'reject', paymentId: payment.id, label: `${payment.renter.fullName} · ${formatPhp(payment.amount)}` })} className="btn btn-danger btn-sm">Reject</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                page={proofsPageData.page}
                pageSize={LIST_PAGE_SIZE}
                total={pendingPayments.length}
                onPageChange={setProofsPage}
                label="proofs"
              />
              </>
            )}
          </section>
        ) : null}

        {activeTab === 'properties' ? (
          <div className="space-y-5">
            <section className="panel">
              <div className="section-head">
                <div><p className="eyebrow">Portfolio</p><h2 className="section-title">Add property</h2></div>
                <button type="button" disabled={Boolean(actionKey)} onClick={onSeedDemo} className="btn btn-ghost btn-sm">
                  {busy('seed-demo') ? 'Creating…' : 'Demo data'}
                </button>
              </div>
              <form onSubmit={onCreateProperty} className="grid gap-3 md:grid-cols-2">
                <label className="field"><span>Name</span><input className="input" required minLength={2} value={propertyName} onChange={(event) => setPropertyName(event.target.value)} /></label>
                <label className="field"><span>Address</span><input className="input" required minLength={5} value={propertyAddress} onChange={(event) => setPropertyAddress(event.target.value)} /></label>
                <button type="submit" disabled={Boolean(actionKey)} className="btn btn-primary md:col-span-2 md:w-fit">{busy('create-property') ? 'Creating…' : 'Create property'}</button>
              </form>
            </section>

            <section className="panel">
              <div className="section-head"><div><p className="eyebrow">Portfolio</p><h2 className="section-title">Your properties</h2></div><span className="badge mono">{filteredProperties.length} listed</span></div>
              {filteredProperties.length === 0 ? <p className="empty-copy">No properties match your search.</p> : (
                <div className="space-y-4">
                  {propertyPageData.slice.map((property) => {
                    const gcashForm = gcashForms[property.id] ?? {
                      accountName: property.gcashAccountName ?? '',
                      mobile: property.gcashMobileNumber ?? '',
                      qr: null as File | null,
                    };
                    const propertyOpen = isPropertyOpen(property.id);
                    const activeUtils = (property.utilityTypes ?? []).filter((u) => u.active).length;
                    return (
                    <article key={property.id} className={`surface property-card ${propertyOpen ? 'is-open' : ''}`}>
                      <button
                        type="button"
                        className="property-card-toggle"
                        aria-expanded={propertyOpen}
                        onClick={() => toggleProperty(property.id)}
                      >
                        <div>
                          <h3 className="m-0 text-xl">{property.name}</h3>
                          <p className="mt-1 mb-0 text-sm text-[var(--muted)]">{property.address}</p>
                        </div>
                        <div className="property-card-meta">
                          <span className="badge mono">
                            {property.units.length} unit{property.units.length === 1 ? '' : 's'}
                            {activeUtils ? ` · ${activeUtils} util` : ''}
                          </span>
                          <span className="accordion-chevron" aria-hidden>
                            {propertyOpen ? '−' : '+'}
                          </span>
                        </div>
                      </button>

                      {propertyOpen ? (
                      <div className="property-card-body">
                      <AccordionSection
                        title="Utilities"
                        summary={
                          activeUtils
                            ? `${activeUtils} active`
                            : 'No utilities yet'
                        }
                        open={isSectionOpen(property.id, 'utilities')}
                        onToggle={() => toggleSection(property.id, 'utilities')}
                      >
                        <div className="utilities-editor accordion-plain">
                        <p className="gcash-meta">
                          Set the rate (e.g. Meralco ₱15.06/kWh). On the Tracker, enter how many units the renter used — amount = rate × consumption. Change the rate anytime and unpaid invoices recalculate.
                        </p>
                        <ul className="utilities-list">
                          {(property.utilityTypes ?? []).length === 0 ? (
                            <li className="text-[var(--muted)]">No utilities yet — try Electricity (kWh) or Water (m³).</li>
                          ) : (
                            (property.utilityTypes ?? []).map((utility) => {
                              const rateEdit =
                                utilityRateEdits[utility.id] ?? String(utility.unitRate ?? 0);
                              return (
                              <li key={utility.id} className={utility.active ? '' : 'is-inactive'}>
                                <div className="utility-rate-row">
                                  <div>
                                    <p className="m-0 font-medium">
                                      {utility.name}
                                      {!utility.active ? ' · inactive' : ''}
                                    </p>
                                    <p className="mt-1 mb-0 text-sm text-[var(--muted)]">
                                      Current{' '}
                                      <span className="mono">
                                        ₱{Number(utility.unitRate).toFixed(2)}/{utility.unitLabel}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-end gap-2">
                                    <label className="field">
                                      <span>Rate (₱/{utility.unitLabel})</span>
                                      <input
                                        className="input"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        disabled={!utility.active || Boolean(actionKey)}
                                        value={rateEdit}
                                        onChange={(event) =>
                                          setUtilityRateEdits((previous) => ({
                                            ...previous,
                                            [utility.id]: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={!utility.active || Boolean(actionKey)}
                                      onClick={() =>
                                        onSaveUtilityRate(utility.id, utility.unitRate)
                                      }
                                    >
                                      {busy(`utility-rate-${utility.id}`) ? '…' : 'Save rate'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      disabled={Boolean(actionKey)}
                                      onClick={() => onToggleUtility(utility.id, !utility.active)}
                                    >
                                      {busy(`utility-${utility.id}`)
                                        ? '…'
                                        : utility.active
                                          ? 'Deactivate'
                                          : 'Activate'}
                                    </button>
                                    {utility.active ? (
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        disabled={Boolean(actionKey)}
                                        onClick={() => onRemoveUtility(utility.id)}
                                      >
                                        {busy(`utility-del-${utility.id}`) ? '…' : 'Remove'}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </li>
                              );
                            })
                          )}
                        </ul>
                        {(() => {
                          const form = utilityForms[property.id] ?? {
                            name: '',
                            unitLabel: 'kWh',
                            unitRate: '',
                          };
                          return (
                            <div className="grid gap-3 md:grid-cols-4">
                              <label className="field">
                                <span>Add utility</span>
                                <input
                                  className="input"
                                  value={form.name}
                                  onChange={(event) =>
                                    setUtilityForms((previous) => ({
                                      ...previous,
                                      [property.id]: { ...form, name: event.target.value },
                                    }))
                                  }
                                  placeholder="Electricity"
                                />
                              </label>
                              <label className="field">
                                <span>Unit</span>
                                <input
                                  className="input"
                                  value={form.unitLabel}
                                  onChange={(event) =>
                                    setUtilityForms((previous) => ({
                                      ...previous,
                                      [property.id]: { ...form, unitLabel: event.target.value },
                                    }))
                                  }
                                  placeholder="kWh or m³"
                                />
                              </label>
                              <label className="field">
                                <span>Rate (₱/unit)</span>
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={form.unitRate}
                                  onChange={(event) =>
                                    setUtilityForms((previous) => ({
                                      ...previous,
                                      [property.id]: { ...form, unitRate: event.target.value },
                                    }))
                                  }
                                  placeholder="15.06"
                                />
                              </label>
                              <button
                                type="button"
                                disabled={Boolean(actionKey)}
                                onClick={() => onAddUtility(property.id)}
                                className="btn btn-ghost self-end"
                              >
                                {busy(`utility-add-${property.id}`) ? 'Adding…' : 'Add'}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                      </AccordionSection>

                      <AccordionSection
                        title="GCash"
                        summary={
                          property.hasGcashQr || property.gcashMobileNumber
                            ? 'Payment details on file'
                            : 'Not set up yet'
                        }
                        open={isSectionOpen(property.id, 'gcash')}
                        onToggle={() => toggleSection(property.id, 'gcash')}
                      >
                      <div className="gcash-pay accordion-plain">
                        <p className="gcash-meta">
                          Renters will see this QR and number when paying. They still upload a proof after paying.
                          {property.hasGcashQr ? ' · QR on file' : ' · No QR uploaded yet'}
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="field">
                            <span>Account name</span>
                            <input
                              className="input"
                              value={gcashForm.accountName}
                              onChange={(event) =>
                                setGcashForms((previous) => ({
                                  ...previous,
                                  [property.id]: { ...gcashForm, accountName: event.target.value },
                                }))
                              }
                              placeholder="Juan Dela Cruz"
                            />
                          </label>
                          <label className="field">
                            <span>GCash mobile</span>
                            <input
                              className="input"
                              value={gcashForm.mobile}
                              onChange={(event) =>
                                setGcashForms((previous) => ({
                                  ...previous,
                                  [property.id]: { ...gcashForm, mobile: event.target.value },
                                }))
                              }
                              placeholder="09171234567"
                            />
                          </label>
                          <label className="field md:col-span-2">
                            <span>QR image (JPG/PNG/WEBP · max 3MB)</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="text-sm text-[var(--muted)] file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:font-semibold file:text-[#f7fbf9]"
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                if (file && file.size > 3 * 1024 * 1024) {
                                  toast('QR image must be 3MB or smaller.', 'error');
                                  event.target.value = '';
                                  return;
                                }
                                setGcashForms((previous) => ({
                                  ...previous,
                                  [property.id]: { ...gcashForm, qr: file },
                                }));
                              }}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(actionKey)}
                          onClick={() => onSaveGcash(property.id)}
                          className="btn btn-primary w-fit"
                        >
                          {busy(`gcash-${property.id}`) ? 'Saving…' : 'Save GCash details'}
                        </button>
                      </div>
                      </AccordionSection>

                      <AccordionSection
                        title="Units"
                        summary={`${property.units.length} unit${property.units.length === 1 ? '' : 's'}`}
                        open={isSectionOpen(property.id, 'units')}
                        onToggle={() => toggleSection(property.id, 'units')}
                      >
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="field min-w-[12rem] flex-1"><span>New unit label</span><input className="input" value={unitLabels[property.id] ?? ''} onChange={(event) => setUnitLabels((previous) => ({ ...previous, [property.id]: event.target.value }))} placeholder="Unit 1A" /></label>
                        <button type="button" disabled={Boolean(actionKey)} onClick={() => onCreateUnit(property.id)} className="btn btn-ghost">{busy(`unit-${property.id}`) ? 'Adding…' : 'Add unit'}</button>
                      </div>
                      <ul className="mt-3 space-y-3">
                        {property.units.length === 0 ? <li className="text-sm text-[var(--muted)]">No units yet.</li> : property.units.map((unit) => {
                          const leaseForm = leaseForms[unit.id] ?? { renterEmail: '', rentAmount: '', dueDay: '5' };
                          const amendForm = amendForms[unit.id] ?? {
                            rentAmount: String(unit.activeLease?.rentAmount ?? ''),
                            dueDay: String(unit.activeLease?.dueDay ?? ''),
                          };
                          return (
                            <li key={unit.id} className="unit-card">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="m-0 font-medium">{unit.label}</p>
                                  {unit.activeLease ? <p className="mt-1 mb-0 text-sm text-[var(--ok)]">Leased to {unit.activeLease.renter?.fullName} · <span className="mono">{formatPhp(unit.activeLease.rentAmount)}</span> · due day {unit.activeLease.dueDay}</p> : <p className="mt-1 mb-0 text-sm text-[var(--warn)]">Vacant</p>}
                                </div>
                                {unit.activeLease ? <button type="button" disabled={Boolean(actionKey)} className="btn btn-danger btn-sm" onClick={() => setConfirm({ kind: 'endLease', unitId: unit.id, label: `${unit.label} · ${unit.activeLease?.renter?.fullName ?? 'renter'}` })}>{busy(`end-lease-${unit.id}`) ? 'Ending…' : 'End lease'}</button> : null}
                              </div>

                              {unit.activeLease ? (
                                <div className="mt-3 flex flex-wrap items-end gap-3">
                                  <label className="field"><span>Rent (PHP)</span><input className="input" type="number" min={1} value={amendForm.rentAmount} onChange={(event) => setAmendForms((previous) => ({ ...previous, [unit.id]: { ...amendForm, rentAmount: event.target.value } }))} /></label>
                                  <label className="field"><span>Due day</span><input className="input" type="number" min={1} max={28} value={amendForm.dueDay} onChange={(event) => setAmendForms((previous) => ({ ...previous, [unit.id]: { ...amendForm, dueDay: event.target.value } }))} /></label>
                                  <button type="button" disabled={Boolean(actionKey)} onClick={() => onUpdateLease(unit.activeLease!.id, amendForm)} className="btn btn-primary btn-sm">{busy(`amend-${unit.activeLease.id}`) ? 'Saving…' : 'Save terms'}</button>
                                </div>
                              ) : (
                                <div className="mt-3 grid gap-3 md:grid-cols-4">
                                  <label className="field md:col-span-2"><span>Renter email</span><input className="input" type="email" value={leaseForm.renterEmail} onChange={(event) => setLeaseForms((previous) => ({ ...previous, [unit.id]: { ...leaseForm, renterEmail: event.target.value } }))} placeholder="renter@email.com" /></label>
                                  <label className="field"><span>Rent (PHP)</span><input className="input" type="number" min={1} value={leaseForm.rentAmount} onChange={(event) => setLeaseForms((previous) => ({ ...previous, [unit.id]: { ...leaseForm, rentAmount: event.target.value } }))} /></label>
                                  <label className="field"><span>Due day</span><input className="input" type="number" min={1} max={28} value={leaseForm.dueDay} onChange={(event) => setLeaseForms((previous) => ({ ...previous, [unit.id]: { ...leaseForm, dueDay: event.target.value } }))} /></label>
                                  <div className="md:col-span-4 flex flex-wrap gap-2">
                                    <button type="button" disabled={Boolean(actionKey)} onClick={() => onCreateLease(unit.id)} className="btn btn-primary">{busy(`lease-${unit.id}`) ? 'Assigning…' : 'Assign renter'}</button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      onClick={async () => {
                                        const email = leaseForm.renterEmail.trim();
                                        const params = new URLSearchParams({ role: 'RENTER' });
                                        if (email) params.set('email', email);
                                        const link = `${window.location.origin}/register?${params.toString()}`;
                                        try {
                                          await navigator.clipboard.writeText(link);
                                          toast(
                                            email
                                              ? 'Invite link copied — send it to your renter.'
                                              : 'Generic renter signup link copied.',
                                            'success',
                                          );
                                        } catch {
                                          toast('Could not copy link', 'error');
                                        }
                                      }}
                                    >
                                      Copy invite link
                                    </button>
                                  </div>
                                </div>
                              )}

                              {(unit.leaseHistory?.length ?? 0) > 0 ? (
                                <div className="mt-4">
                                  <p className="eyebrow">Lease history</p>
                                  <ul className="history-list">
                                    {unit.leaseHistory!.map((lease) => (
                                      <li key={lease.id}>{lease.renter?.fullName ?? lease.renter?.email ?? 'Renter'} · {formatPhp(lease.rentAmount)} · due day {lease.dueDay} · {lease.startDate}{lease.endDate ? ` to ${lease.endDate}` : ' to present'} · {lease.status}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      </AccordionSection>
                      </div>
                      ) : null}
                    </article>
                    );
                  })}
                  <Pagination
                    page={propertyPageData.page}
                    pageSize={PROPERTY_PAGE_SIZE}
                    total={filteredProperties.length}
                    onPageChange={setPropertyPage}
                    label="properties"
                  />
                </div>
              )}
            </section>
          </div>
        ) : null}

        {activeTab === 'inbox' ? (
          <div className="space-y-3">
            <NotificationInbox
              items={inboxPageData.slice}
              markAllBusy={Boolean(actionKey)}
              onMarkAllRead={token ? async () => {
                await api.markAllNotificationsRead(token);
                await refresh(token);
                toast('All notifications marked read.', 'success');
              } : undefined}
              onMarkOneRead={onMarkOneRead}
              onOpenItem={onOpenNotification}
            />
            <Pagination
              page={inboxPageData.page}
              pageSize={LIST_PAGE_SIZE}
              total={inbox.length}
              onPageChange={setInboxPage}
              label="notifications"
            />
          </div>
        ) : null}

        {activeTab === 'activity' ? (
          <section className="panel">
            <div className="section-head"><div><p className="eyebrow">Account trail</p><h2 className="section-title">Activity</h2></div></div>
            {audit.length === 0 ? <p className="empty-copy">No activity recorded yet.</p> : (
              <>
              <ul className="audit-list">
                {activityPageData.slice.map((event) => (
                  <li key={event.id} className="tracker-row">
                    <p className="m-0 font-medium">{event.summary}</p>
                    <p className="mt-1 mb-0 text-xs text-[var(--muted)]"><span className="mono">{event.action}</span> · {new Date(event.createdAt).toLocaleString('en-PH')}</p>
                  </li>
                ))}
              </ul>
              <Pagination
                page={activityPageData.page}
                pageSize={LIST_PAGE_SIZE}
                total={audit.length}
                onPageChange={setActivityPage}
                label="events"
              />
              </>
            )}
          </section>
        ) : null}

        <p className="mt-10 text-sm text-[var(--muted)]"><Link href="/" className="nav-link">Back home</Link></p>
      </AppShell>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'markPaid' ? 'Mark invoice as paid?' : confirm?.kind === 'waive' ? 'Waive this invoice?' : confirm?.kind === 'reject' ? 'Reject this payment?' : confirm?.kind === 'endLease' ? 'End this lease?' : 'Confirm this payment?'}
        body={confirm ? confirm.kind === 'reject' ? `${confirm.label} will stay unpaid and the renter can submit again.` : confirm.kind === 'endLease' ? `${confirm.label} will become vacant. Unpaid invoices stay on the tracker.` : confirm.kind === 'waive' ? `${confirm.label} will be waived and no payment will be required.` : `${confirm.label} will be recorded as paid.` : ''}
        confirmLabel={confirm?.kind === 'reject' ? 'Reject payment' : confirm?.kind === 'markPaid' ? 'Mark paid' : confirm?.kind === 'waive' ? 'Waive invoice' : confirm?.kind === 'endLease' ? 'End lease' : 'Confirm paid'}
        danger={confirm?.kind === 'reject' || confirm?.kind === 'endLease' || confirm?.kind === 'waive'}
        busy={Boolean(actionKey)}
        onCancel={() => setConfirm(null)}
        onConfirm={executeConfirm}
      />

      <PartialPayDialog
        open={Boolean(partialItem)}
        renterName={partialItem?.renter.fullName ?? ''}
        invoiceTotal={partialItem?.amount ?? 0}
        busy={partialItem ? busy(`partial-${partialItem.id}`) : false}
        onCancel={() => setPartialItem(null)}
        onSubmit={onSubmitPartial}
      />

      <Celebrate payload={celebrate} onDone={() => setCelebrate(null)} />

      {proofPayment ? (
        <ProofModal
          payment={proofPayment}
          proofUrl={proofUrl}
          proofKind={proofKind}
          loading={proofLoading}
          busy={Boolean(actionKey)}
          onClose={closeProofModal}
          onConfirm={() => setConfirm({ kind: 'confirm', paymentId: proofPayment.id, label: `${proofPayment.renter.fullName} · ${formatPhp(proofPayment.amount)}` })}
          onReject={() => setConfirm({ kind: 'reject', paymentId: proofPayment.id, label: `${proofPayment.renter.fullName} · ${formatPhp(proofPayment.amount)}` })}
        />
      ) : null}
    </>
  );
}
