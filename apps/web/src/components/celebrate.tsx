'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export type CelebratePayload = {
  title: string;
  subtitle?: string;
} | null;

type CelebrateProps = {
  payload: CelebratePayload;
  onDone: () => void;
};

const PIECES = Array.from({ length: 48 }, (_, index) => ({
  id: index,
  left: `${3 + ((index * 19) % 94)}%`,
  delay: `${(index % 14) * 0.04}s`,
  duration: `${1.6 + (index % 6) * 0.2}s`,
  drift: `${(index % 2 === 0 ? -1 : 1) * (24 + (index % 8) * 10)}px`,
  spin: `${200 + (index % 9) * 45}deg`,
  tone: (index % 6) + 1,
  size: 9 + (index % 6) * 3,
}));

export function Celebrate({ payload, onDone }: CelebrateProps) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!payload) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => onDoneRef.current(), 3800);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [payload]);

  if (!payload || typeof document === 'undefined') return null;

  return createPortal(
    <div className="celebrate-backdrop" role="status" aria-live="polite">
      <div className="celebrate-confetti" aria-hidden>
        {PIECES.map((piece) => (
          <span
            key={piece.id}
            className={`celebrate-piece celebrate-piece-${piece.tone}`}
            style={
              {
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                width: piece.size,
                height: piece.size * 1.45,
                '--drift': piece.drift,
                '--spin': piece.spin,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="celebrate-card">
        <div className="celebrate-badge" aria-hidden>
          ✓
        </div>
        <p className="eyebrow">Celebration</p>
        <h2 className="celebrate-title">{payload.title}</h2>
        {payload.subtitle ? <p className="celebrate-subtitle">{payload.subtitle}</p> : null}
        <p className="celebrate-hint">BayadRent keeps the quiet ledger tidy.</p>
        <button type="button" className="btn btn-primary celebrate-dismiss" onClick={onDone}>
          Continue
        </button>
      </div>
    </div>,
    document.body,
  );
}
