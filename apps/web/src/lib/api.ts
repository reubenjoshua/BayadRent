const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'LANDLORD' | 'RENTER';
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

export type InvoiceLineItem = {
  id: string;
  kind: 'RENT' | 'UTILITY';
  label: string;
  amount: number;
  utilityTypeId: string | null;
  unitRate?: number | null;
  unitLabel?: string | null;
  quantity?: number;
};

export type PropertyUtilityType = {
  id: string;
  name: string;
  unitLabel: string;
  unitRate: number;
  sortOrder: number;
  active: boolean;
};

export type PaymentTiming = 'EARLY' | 'ON_TIME' | 'LATE' | 'UNPAID' | 'WAIVED';

export type CalendarInvoice = {
  id: string;
  amount: number;
  dueDate: string;
  status: InvoiceStatus;
  periodYear: number;
  periodMonth: number;
  paidAt: string | null;
  timing: PaymentTiming;
  lineItems: InvoiceLineItem[];
  unit: { id: string; label: string };
  property: { id: string; name: string; address: string };
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type LeaseSummary = {
  id: string;
  rentAmount: number;
  dueDay: number;
  startDate: string;
  endDate?: string | null;
  status: 'ACTIVE' | 'ENDED';
  renter?: {
    id: string;
    email: string;
    fullName: string;
  };
};

export type UnitWithLease = {
  id: string;
  propertyId: string;
  label: string;
  activeLease: LeaseSummary | null;
  leaseHistory?: LeaseSummary[];
};

export type PropertyWithUnits = {
  id: string;
  landlordId: string;
  name: string;
  address: string;
  gcashAccountName?: string | null;
  gcashMobileNumber?: string | null;
  hasGcashQr?: boolean;
  utilityTypes?: PropertyUtilityType[];
  units: UnitWithLease[];
};

export type RenterLease = {
  id: string;
  rentAmount: number;
  dueDay: number;
  startDate: string;
  status: 'ACTIVE' | 'ENDED';
  unit: { id: string; label: string };
  property: { id: string; name: string; address: string };
};

export type InvoiceStatus = 'DRAFT' | 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';

export type PendingPaymentInfo = {
  id: string;
  status: string;
  hasProof: boolean;
  note: string | null;
  createdAt?: string;
};

export type TrackerInvoice = {
  id: string;
  amount: number;
  originalAmount?: number;
  amountPaid?: number;
  dueDate: string;
  status: InvoiceStatus;
  periodYear: number;
  periodMonth: number;
  paidAt: string | null;
  leaseId: string;
  renter: { id: string; email: string; fullName: string };
  unit: { id: string; label: string };
  property: { id: string; name: string; address: string };
  lineItems?: InvoiceLineItem[];
  pendingPayment: PendingPaymentInfo | null;
};

export type TrackerResponse = {
  summary: {
    due: number;
    overdue: number;
    paid: number;
    partial?: number;
    waived?: number;
    pendingReview: number;
    total: number;
  };
  items: TrackerInvoice[];
};

export type AuditEvent = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
};

export type RenterInvoice = {
  id: string;
  amount: number;
  originalAmount?: number;
  amountPaid?: number;
  dueDate: string;
  status: InvoiceStatus;
  periodYear: number;
  periodMonth: number;
  paidAt: string | null;
  lineItems?: InvoiceLineItem[];
  unit: { id: string; label: string };
  property: {
    id: string;
    name: string;
    address: string;
    gcashAccountName?: string | null;
    gcashMobileNumber?: string | null;
    hasGcashQr?: boolean;
  };
  pendingPayment: PendingPaymentInfo | null;
};

export type PaymentReviewItem = {
  id: string;
  invoiceId: string;
  amount: number;
  status: string;
  note: string | null;
  hasProof: boolean;
  proofOriginalName: string | null;
  createdAt: string;
  renter: { id: string; email: string; fullName: string };
  unit: { id: string; label: string };
  property: { id: string; name: string; address: string };
  invoice: {
    id: string;
    periodYear: number;
    periodMonth: number;
    dueDate: string;
    status: string;
  };
};

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      (data as { message?: string | string[] }).message ?? 'Request failed';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data as T;
}

export const api = {
  register(body: {
    email: string;
    password: string;
    fullName: string;
    role: 'LANDLORD' | 'RENTER';
  }) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  login(body: { email: string; password: string }) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  me(token: string) {
    return request<AuthUser>('/auth/me', { token });
  },
  updateProfile(
    token: string,
    body: {
      fullName?: string;
      phone?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    },
  ) {
    return request<AuthUser>('/auth/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    });
  },
  listProperties(token: string) {
    return request<PropertyWithUnits[]>('/properties', { token });
  },
  listUtilities(token: string, propertyId: string) {
    return request<PropertyUtilityType[]>(`/properties/${propertyId}/utilities`, { token });
  },
  createUtility(
    token: string,
    propertyId: string,
    body: { name: string; unitLabel?: string; unitRate?: number; sortOrder?: number },
  ) {
    return request<PropertyUtilityType>(`/properties/${propertyId}/utilities`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  updateUtility(
    token: string,
    utilityTypeId: string,
    body: {
      name?: string;
      unitLabel?: string;
      unitRate?: number;
      sortOrder?: number;
      active?: boolean;
    },
  ) {
    return request<PropertyUtilityType>(`/utilities/${utilityTypeId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    });
  },
  deleteUtility(token: string, utilityTypeId: string) {
    return request<{ ok: boolean }>(`/utilities/${utilityTypeId}`, {
      method: 'DELETE',
      token,
    });
  },
  createProperty(token: string, body: { name: string; address: string }) {
    return request<PropertyWithUnits>('/properties', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  async updatePropertyGcash(
    token: string,
    propertyId: string,
    body: { gcashAccountName?: string; gcashMobileNumber?: string; qr?: File | null },
  ) {
    const form = new FormData();
    if (body.gcashAccountName !== undefined) form.append('gcashAccountName', body.gcashAccountName);
    if (body.gcashMobileNumber !== undefined) form.append('gcashMobileNumber', body.gcashMobileNumber);
    if (body.qr) form.append('qr', body.qr);
    const res = await fetch(`${API_URL}/properties/${propertyId}/gcash`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data as { message?: string | string[] }).message ?? 'Failed to update GCash details';
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    }
    return data as {
      id: string;
      name: string;
      gcashAccountName: string | null;
      gcashMobileNumber: string | null;
      hasGcashQr: boolean;
    };
  },
  gcashQrUrl(propertyId: string) {
    return `${API_URL}/properties/${propertyId}/gcash-qr`;
  },
  async fetchGcashQrBlob(token: string, propertyId: string) {
    const res = await fetch(api.gcashQrUrl(propertyId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Could not load GCash QR');
    return res.blob();
  },
  createUnit(token: string, propertyId: string, body: { label: string }) {
    return request<UnitWithLease>(`/properties/${propertyId}/units`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  createLease(
    token: string,
    unitId: string,
    body: { renterEmail: string; rentAmount: number; dueDay: number; startDate?: string },
  ) {
    return request(`/units/${unitId}/leases`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },
  endLease(token: string, unitId: string) {
    return request(`/units/${unitId}/end-lease`, {
      method: 'POST',
      token,
    });
  },
  updateLease(
    token: string,
    leaseId: string,
    body: { rentAmount?: number; dueDay?: number },
  ) {
    return request(`/leases/${leaseId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    });
  },
  seedDemo(token: string) {
    return request<{
      message: string;
      demoRenter: { email: string; password: string; fullName: string };
    }>('/properties/demo', { method: 'POST', token });
  },
  myLeases(token: string) {
    return request<RenterLease[]>('/leases/me', { token });
  },
  getTracker(token: string) {
    return request<TrackerResponse>('/billing/tracker', { token });
  },
  generateInvoices(token: string, body?: { year?: number; month?: number }) {
    return request<{ year: number; month: number; created: number; skipped: number }>(
      '/billing/generate',
      {
        method: 'POST',
        token,
        body: JSON.stringify(body ?? {}),
      },
    );
  },
  myInvoices(token: string) {
    return request<RenterInvoice[]>('/billing/my-invoices', { token });
  },
  myCalendar(token: string, year: number, month: number) {
    return request<{ year: number; month: number; items: CalendarInvoice[] }>(
      `/billing/my-calendar?year=${year}&month=${month}`,
      { token },
    );
  },
  updateInvoiceLines(
    token: string,
    invoiceId: string,
    lines: { id: string; quantity?: number; unitRate?: number; label?: string }[],
  ) {
    return request<TrackerInvoice>(`/billing/invoices/${invoiceId}/lines`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ lines }),
    });
  },
  markInvoicePaid(token: string, invoiceId: string) {
    return request<TrackerInvoice>(`/billing/invoices/${invoiceId}/mark-paid`, {
      method: 'POST',
      token,
    });
  },
  waiveInvoice(token: string, invoiceId: string) {
    return request<TrackerInvoice>(`/billing/invoices/${invoiceId}/waive`, {
      method: 'POST',
      token,
    });
  },
  partialPayInvoice(token: string, invoiceId: string, paidAmount: number) {
    return request<TrackerInvoice>(`/billing/invoices/${invoiceId}/partial`, {
      method: 'POST',
      token,
      body: JSON.stringify({ paidAmount }),
    });
  },
  async downloadReceipt(token: string, invoiceId: string) {
    const res = await fetch(`${API_URL}/billing/invoices/${invoiceId}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message =
        (data as { message?: string | string[] }).message ?? 'Receipt download failed';
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `bayadrent-receipt-${invoiceId}.html`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  listAudit(token: string) {
    return request<AuditEvent[]>('/audit/me', { token });
  },
  listPendingPayments(token: string) {
    return request<PaymentReviewItem[]>('/payments/pending', { token });
  },
  async submitPayment(
    token: string,
    invoiceId: string,
    input: { note?: string; proof?: File | null },
  ) {
    const form = new FormData();
    if (input.note) form.append('note', input.note);
    if (input.proof) form.append('proof', input.proof);

    const res = await fetch(
      `${API_URL}/payments/invoices/${invoiceId}/submit`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data as { message?: string | string[] }).message ?? 'Request failed';
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    }
    return data as PaymentReviewItem;
  },
  confirmPayment(token: string, paymentId: string) {
    return request<PaymentReviewItem>(`/payments/${paymentId}/confirm`, {
      method: 'POST',
      token,
    });
  },
  rejectPayment(token: string, paymentId: string) {
    return request<PaymentReviewItem>(`/payments/${paymentId}/reject`, {
      method: 'POST',
      token,
    });
  },
  proofUrl(paymentId: string) {
    return `${API_URL}/payments/${paymentId}/proof`;
  },
  listNotifications(token: string) {
    return request<
      {
        id: string;
        type: string;
        title: string;
        body: string;
        relatedInvoiceId: string | null;
        readAt: string | null;
        createdAt: string;
      }[]
    >('/notify/inbox', { token });
  },
  runReminders(token: string) {
    return request<{
      created: number;
      scanned: number;
      leaseCount: number;
      queued: boolean;
      message: string;
    }>('/notify/reminders/run', { method: 'POST', token });
  },
  markNotificationRead(token: string, notificationId: string) {
    return request(`/notify/inbox/${notificationId}/read`, {
      method: 'POST',
      token,
    });
  },
  markAllNotificationsRead(token: string) {
    return request('/notify/inbox/read-all', { method: 'POST', token });
  },
};
