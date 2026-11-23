'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { api } from '@/lib/api';
import { saveSession } from '@/lib/auth-storage';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.login({ email, password });
      saveSession(result.accessToken, result.user);
      router.push(result.user.role === 'LANDLORD' ? '/landlord' : '/renter');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-hero">
      <div className="shell grid w-full max-w-lg items-center">
        <div className="surface fade-up p-7 md:p-9">
          <BrandMark />
          <h1 className="mt-5 text-3xl md:text-4xl">Welcome back</h1>
          <p className="lead mt-3">
            No account?{' '}
            <Link href="/register" className="nav-link">
              Create one
            </Link>
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
