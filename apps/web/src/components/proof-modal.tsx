'use client';

import type { PaymentReviewItem } from '@/lib/api';

type ProofModalProps = {
  payment: PaymentReviewItem;
  proofUrl: string | null;
  proofKind: 'image' | 'pdf' | 'unknown' | null;
  loading?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReject: () => void;
};

function formatPhp(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ProofModal({
  payment,
  proofUrl,
  proofKind,
  loading,
  busy,
  onClose,
  onConfirm,
  onReject,
}: ProofModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proof-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-head" style={{ marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow">Proof review</p>
            <h2 id="proof-title" className="modal-title">
              {payment.renter.fullName}
            </h2>
            <p className="modal-body" style={{ marginTop: '0.35rem' }}>
              {payment.property.name} · {payment.unit.label} ·{' '}
              <span className="mono">{formatPhp(payment.amount)}</span>
              {payment.note ? ` · “${payment.note}”` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="proof-frame">
          {loading ? (
            <p className="empty-copy">Loading proof…</p>
          ) : !payment.hasProof ? (
            <p className="empty-copy">No file was attached with this payment.</p>
          ) : proofUrl && proofKind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proofUrl} alt="Payment proof" className="proof-image" />
          ) : proofUrl && proofKind === 'pdf' ? (
            <iframe title="Payment proof PDF" src={proofUrl} className="proof-pdf" />
          ) : proofUrl ? (
            <a href={proofUrl} target="_blank" rel="noreferrer" className="nav-link">
              Open proof file
            </a>
          ) : (
            <p className="empty-copy">Could not load proof.</p>
          )}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={onReject}
          >
            Reject
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : 'Confirm paid'}
          </button>
        </div>
      </div>
    </div>
  );
}
