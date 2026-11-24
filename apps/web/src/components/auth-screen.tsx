'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Home } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';
import { saveSession } from '@/lib/auth-storage';

const pillSpring = { type: 'spring' as const, stiffness: 420, damping: 32 };

type AuthMode = 'signin' | 'signup';
type Role = 'LANDLORD' | 'RENTER';

type AuthScreenProps = {
  initialMode?: AuthMode;
  initialEmail?: string;
  initialRole?: Role;
};

export function AuthScreen({
  initialMode = 'signin',
  initialEmail = '',
  initialRole = 'LANDLORD',
}: AuthScreenProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<Role>(initialRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = isSignup
        ? await api.register({ email, password, fullName, role })
        : await api.login({ email, password });
      saveSession(result.accessToken, result.user);
      router.push(result.user.role === 'LANDLORD' ? '/landlord' : '/renter');
    } catch (err) {
      setError(err instanceof Error ? err.message : isSignup ? 'Registration failed' : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <aside className="auth-visual" aria-hidden="true">
        <div className="auth-visual-wash" />
        <div className="auth-visual-frame">
          <BrandMark size="lg" />

          <div className="auth-preview">
            <div className="auth-preview-head">
              <p className="auth-preview-label">This month</p>
              <p className="auth-preview-rate">Collection 96%</p>
            </div>
            <div className="auth-preview-row">
              <div>
                <p className="auth-preview-title">Unit 4B — Ana Reyes</p>
                <p className="auth-preview-meta">Paid</p>
              </div>
              <p className="auth-preview-amount">₱18,500</p>
            </div>
            <div className="auth-preview-row">
              <div>
                <p className="auth-preview-title">Unit 1A — Jon Cruz</p>
                <p className="auth-preview-meta is-due">Due Mar 5</p>
              </div>
              <p className="auth-preview-amount">₱16,000</p>
            </div>
            <div className="auth-preview-row">
              <div>
                <p className="auth-preview-title">Studio — Kim Santos</p>
                <p className="auth-preview-meta is-overdue">Overdue</p>
              </div>
              <p className="auth-preview-amount">₱12,500</p>
            </div>
          </div>

          <div className="auth-visual-copy">
            <p className="auth-visual-kicker">
              Track who paid.
              <br />
              Collect what&apos;s due.
            </p>
            <p className="auth-visual-sub">
              A calm rent workspace for landlords and renters.
            </p>
          </div>
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-panel-inner fade-up">
          <Link href="/" className="auth-back">
            <Home size={14} strokeWidth={2.25} aria-hidden />
            Home
          </Link>

          <div className="auth-mode-toggle" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={`auth-mode-btn ${!isSignup ? 'is-active' : ''}`}
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
            >
              {!isSignup ? (
                <motion.span
                  layoutId="auth-mode-pill"
                  className="auth-toggle-pill"
                  transition={pillSpring}
                />
              ) : null}
              <span className="auth-toggle-label">Sign in</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={`auth-mode-btn ${isSignup ? 'is-active' : ''}`}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
            >
              {isSignup ? (
                <motion.span
                  layoutId="auth-mode-pill"
                  className="auth-toggle-pill"
                  transition={pillSpring}
                />
              ) : null}
              <span className="auth-toggle-label">Create account</span>
            </button>
          </div>

          <p className="eyebrow">{isSignup ? 'Create account' : 'Welcome back'}</p>
          <h1 className="auth-title">{isSignup ? 'Join BayadRent' : 'Sign in'}</h1>
          <p className="lead auth-lead">
            {isSignup
              ? 'Set up your landlord or renter account in a minute.'
              : 'Access your collection board or renter portal.'}
          </p>

          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-role-pill" role="group" aria-label="Sign in as">
              <span className="auth-role-pill-label">Sign in as</span>
              <div className="auth-role-toggle">
                <button
                  type="button"
                  className={`auth-role-btn ${role === 'LANDLORD' ? 'is-active' : ''}`}
                  onClick={() => setRole('LANDLORD')}
                >
                  {role === 'LANDLORD' ? (
                    <motion.span
                      layoutId="auth-role-pill"
                      className="auth-toggle-pill"
                      transition={pillSpring}
                    />
                  ) : null}
                  <span className="auth-toggle-label">Landlord</span>
                </button>
                <button
                  type="button"
                  className={`auth-role-btn ${role === 'RENTER' ? 'is-active' : ''}`}
                  onClick={() => setRole('RENTER')}
                >
                  {role === 'RENTER' ? (
                    <motion.span
                      layoutId="auth-role-pill"
                      className="auth-toggle-pill"
                      transition={pillSpring}
                    />
                  ) : null}
                  <span className="auth-toggle-label">Renter</span>
                </button>
              </div>
            </div>

            {isSignup ? (
              <label className="field">
                <span>Full name</span>
                <input
                  className="input auth-input"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="e.g. Maria Santos"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input
                className="input auth-input"
                type="email"
                autoComplete="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="auth-password-label">
                Password
                {!isSignup ? (
                  <button
                    type="button"
                    className="auth-forgot"
                    onClick={async () => {
                      if (!email.trim()) {
                        toast('Enter your email first, then tap Forgot password.', 'info');
                        return;
                      }
                      try {
                        const result = await api.forgotPassword(email.trim());
                        toast(result.message, 'success');
                      } catch (err) {
                        toast(
                          err instanceof Error ? err.message : 'Could not send reset email',
                          'error',
                        );
                      }
                    }}
                  >
                    Forgot password?
                  </button>
                ) : null}
              </span>
              <div className="auth-password-wrap">
                <input
                  className="input auth-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading
                ? isSignup
                  ? 'Creating…'
                  : 'Signing in…'
                : isSignup
                  ? 'Create account'
                  : 'Sign in'}
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="btn btn-ghost w-full auth-google"
              onClick={() => toast('Google sign-in is coming soon.', 'info')}
            >
              <GoogleGlyph />
              Continue with Google
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
