'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';

function RegisterForm() {
  const params = useSearchParams();
  const email = params.get('email')?.trim() || undefined;
  const roleParam = params.get('role')?.toUpperCase();
  const role =
    roleParam === 'RENTER' || roleParam === 'LANDLORD' ? roleParam : undefined;

  return (
    <AuthScreen
      initialMode="signup"
      initialEmail={email}
      initialRole={role}
    />
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="shell">Loading…</div>
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
