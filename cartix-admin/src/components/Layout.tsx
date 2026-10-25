import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { NAV } from './nav';

const COLLAPSED_KEY = 'cartix_admin_nav_collapsed';

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function Layout() {
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  // On phones the menu is closed by default and closes again after navigating.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const menuOpen = menuOpenAt === location.pathname;

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* Storage can be unavailable in private windows; the menu still works. */
    }
  }, [collapsed]);

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.permission)) })).filter((g) => g.items.length > 0);
  const toggle = (id: string) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="shell">
      <aside className={`side${menuOpen ? ' open' : ''}`}>
        <div className="side-top">
          <div className="side-brand">
            <img src="/logo/cartix-logo-horizontal-white.png" alt="Cartix" width={142} height={40} />
            <span>Admin panel</span>
          </div>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-menu"
            onClick={() => setMenuOpenAt(menuOpen ? null : location.pathname)}>
            {menuOpen ? 'Close menu' : 'Menu'}
          </button>
        </div>
        <nav id="main-menu" aria-label="Main menu" className="side-nav">
          {groups.map((g) => {
            const open = !collapsed.includes(g.id);
            return (
              <div key={g.id} className="nav-group">
                <button type="button" className="nav-group-head" aria-expanded={open} aria-controls={`nav-${g.id}`} onClick={() => toggle(g.id)}>
                  <span>{g.label}</span>
                  <span aria-hidden="true">{open ? '−' : '+'}</span>
                </button>
                {open && (
                  <div id={`nav-${g.id}`} className="nav-items">
                    {g.items.map((i) => (
                      <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="side-user">
          <span>{user?.name}</span>
          <span className="num">{user?.phone}</span>
          <span className="role-label">{user?.roles.map((r) => r.replace('_', ' ')).join(', ')}</span>
          <button type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 22 }} />
      ))}
    </div>
  );
}
