'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type GcashPayPanelProps = {
  token: string;
  propertyId: string;
  propertyName: string;
  amountLabel: string;
  accountName?: string | null;
  mobileNumber?: string | null;
  hasQr?: boolean;
};

export function GcashPayPanel({
  token,
  propertyId,
  propertyName,
  amountLabel,
  accountName,
  mobileNumber,
  hasQr,
}: GcashPayPanelProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasQr) {
      setQrUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .fetchGcashQrBlob(token, propertyId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setQrUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, propertyId, hasQr]);

  if (!accountName && !mobileNumber && !hasQr) {
    return (
      <div className="gcash-pay">
        <p className="eyebrow">GCash</p>
        <p className="gcash-meta mb-0">
          Your landlord hasn&apos;t added GCash details for {propertyName} yet. You can still pay
          another way and upload proof below.
        </p>
      </div>
    );
  }

  return (
    <div className="gcash-pay">
      <div>
        <p className="eyebrow">Scan to pay</p>
        <p className="gcash-meta mt-2 mb-0">
          Pay <strong className="mono">{amountLabel}</strong> via GCash, then upload your receipt
          below.
        </p>
      </div>
      <div className="gcash-pay-grid">
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt={`GCash QR for ${propertyName}`} className="gcash-qr-img" />
        ) : hasQr ? (
          <div className="gcash-qr-img grid place-items-center text-xs text-[var(--muted)]">
            Loading QR…
          </div>
        ) : (
          <div className="gcash-qr-img grid place-items-center text-xs text-[var(--muted)]">
            No QR image
          </div>
        )}
        <div>
          {accountName ? (
            <p className="gcash-meta">
              Name<br />
              <strong>{accountName}</strong>
            </p>
          ) : null}
          {mobileNumber ? (
            <p className="gcash-meta mt-3">
              Number<br />
              <strong className="mono">{mobileNumber}</strong>
            </p>
          ) : null}
          <p className="gcash-meta mt-3 mb-0">
            Tip: include the invoice period in your GCash note so your landlord can match it faster.
          </p>
        </div>
      </div>
    </div>
  );
}
