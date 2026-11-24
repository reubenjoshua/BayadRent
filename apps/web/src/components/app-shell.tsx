'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';

export type ShellNavItem = {
  key: string;
  label: string;
  badge?: number;
};

export type ShellNavGroup = {
  label: string;
  items: ShellNavItem[];
};

type AppShellProps = {
  roleLabel: string;
  title: string;
  subtitle: string;
  groups: ShellNavGroup[];
  activeKey: string;
  onNavigate: (key: string) => void;
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  roleLabel,
  title,
  subtitle,
  groups,
  activeKey,
  onNavigate,
  onLogout,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setNavOpen(false);
  }, [activeKey]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function go(key: string) {
    onNavigate(key);
    setNavOpen(false);
  }

  return (
    <div className={`cms-shell ${navOpen ? 'is-nav-open' : ''}`}>
      <div
        className="cms-backdrop"
        aria-hidden={!navOpen}
        onClick={() => setNavOpen(false)}
      />

      <aside id="cms-sidebar" className="cms-sidebar" aria-label="Main navigation">
        <div className="cms-sidebar-brand">
          <BrandMark size="sm" />
          <p className="eyebrow cms-role">{roleLabel}</p>
        </div>

        <nav className="cms-nav" aria-labelledby={titleId}>
          {groups.map((group) => (
            <div key={group.label} className="cms-nav-group">
              <p className="cms-nav-group-label">{group.label}</p>
              <ul className="cms-nav-list">
                {group.items.map((item) => {
                  const active = item.key === activeKey;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={`cms-nav-item ${active ? 'is-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => go(item.key)}
                      >
                        <span>{item.label}</span>
                        {item.badge ? (
                          <span className="cms-nav-badge">{item.badge}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="cms-sidebar-foot">
          <button type="button" className="btn btn-ghost cms-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="cms-main">
        <header className="cms-topbar">
          <button
            type="button"
            className="cms-menu-btn"
            aria-expanded={navOpen}
            aria-controls="cms-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="sr-only">{navOpen ? 'Close menu' : 'Open menu'}</span>
            <span aria-hidden className="cms-menu-icon" />
          </button>
          <div className="cms-topbar-copy">
            <p className="eyebrow" id={titleId}>
              {roleLabel}
            </p>
            <h1 className="cms-page-title">{title}</h1>
            <p className="lead cms-page-lead">{subtitle}</p>
          </div>
        </header>

        <div className="cms-content fade-up">{children}</div>
      </div>
    </div>
  );
}
