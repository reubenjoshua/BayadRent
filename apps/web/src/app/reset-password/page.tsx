'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { api } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('Missing reset token. Request a new link from Sign in.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => router.push('/login'), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="page">
        <div className="shell" style={{ maxWidth: 420 }}>
          <h1 className="text-3xl">Reset link invalid</h1>
          <p className="lead mt-3">Request a new password reset from the sign-in page.</p>
          <Link href="/login" className="btn btn-primary mt-6 inline-flex">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell surface p-7 md:p-9" style={{ maxWidth: 420 }}>
        <p className="eyebrow">Security</p>
        <h1 className="mt-2 text-3xl">Choose a new password</h1>
        <p className="lead mt-3">Use at least 8 characters.</p>
        {done ? (
          <p className="success-text mt-6">Password updated. Redirecting to sign in…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="field">
              <span>New password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="shell">Loading…</div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
