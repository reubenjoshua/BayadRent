const API = 'http://localhost:4000/api';

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.accessToken;
}

const landlordToken = await login('landlord@bayadrent.local');
const renterToken = await login('renter@bayadrent.local');

await fetch(`${API}/billing/generate`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${landlordToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ year: 2026, month: 12 }),
});

const trackerRes = await fetch(`${API}/billing/tracker`, {
  headers: { Authorization: `Bearer ${landlordToken}` },
});
const tracker = await trackerRes.json();
const unpaid = tracker.items.find((i) => i.status !== 'PAID');
if (!unpaid) throw new Error('No unpaid invoice');

const form = new FormData();
form.append('note', 'Paid via GCash');
form.append('proof', new Blob(['fake-image'], { type: 'image/png' }), 'proof.png');

const submitRes = await fetch(`${API}/payments/invoices/${unpaid.id}/submit`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${renterToken}` },
  body: form,
});
const submitted = await submitRes.json();
console.log('submit', submitRes.status, submitted.status, submitted.hasProof);

const pendingRes = await fetch(`${API}/payments/pending`, {
  headers: { Authorization: `Bearer ${landlordToken}` },
});
const pending = await pendingRes.json();
console.log('pending', pending.length);

const confirmRes = await fetch(`${API}/payments/${submitted.id}/confirm`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${landlordToken}` },
});
const confirmed = await confirmRes.json();
console.log('confirm', confirmRes.status, confirmed.status, confirmed.invoice?.status);
