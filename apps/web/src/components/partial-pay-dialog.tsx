'use client';

import { FormEvent, useEffect, useState } from 'react';

type PartialPayDialogProps = {
  open: boolean;
  renterName: string;
  invoiceTotal: number;
  busy?: boolean;
  onSubmit: (paidAmount: number) => void;
  onCancel: () => void;
};

function formatPhp(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PartialPayDialog({
  open,
  renterName,
  invoiceTotal,
  busy,
  onSubmit,
  onCancel,
}: PartialPayDialogProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const paid = Number(amount);
  const remaining =
    Number.isFinite(paid) && paid > 0 ? Math.max(invoiceTotal - paid, 0) : invoiceTotal;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (value >= invoiceTotal) {
      setError(`Partial must be less than ${formatPhp(invoiceTotal)}. Use Mark paid for the full amount.`);
      return;
    }
    setError(null);
    onSubmit(value);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partial-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <p className="eyebrow">Partial payment</p>
        <h2 id="partial-title" className="modal-title">
          Record partial for {renterName}
        </h2>
        <p className="modal-body">
          Remaining balance is <span className="mono">{formatPhp(invoiceTotal)}</span>. Enter how
          much was paid now — the rest stays due.
        </p>

        <label className="field mt-4">
          <span>Amount paid (PHP)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={invoiceTotal - 1}
            step={1}
            autoFocus
            disabled={busy}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            placeholder="e.g. 2000"
          />
        </label>

        {Number.isFinite(paid) && paid > 0 && paid < invoiceTotal ? (
          <p className="partial-preview mono">
            Remaining after this: {formatPhp(remaining)}
          </p>
        ) : null}

        {error ? <p className="error-text mt-2 mb-0">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save partial'}
          </button>
        </div>
      </form>
    </div>
  );
}
