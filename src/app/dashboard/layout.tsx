import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Omterminal Intelligence',
  description: 'Intelligence dashboard — signals, trends, and insights.',
};

const tabs = [
  { label: 'Signals', href: '/dashboard/signals' },
  { label: 'Trends',  href: '/dashboard/trends'  },
  { label: 'Insights', href: '/dashboard/insights' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 28,
        fontWeight: 600,
        color: 'var(--text)',
        marginBottom: 8,
        letterSpacing: '-0.01em',
      }}>
        Omterminal Intelligence
      </h1>

      <nav style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 32,
        paddingBottom: 0,
      }}>
        {tabs.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: 'inline-block',
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text2)',
              textDecoration: 'none',
              borderRadius: '7px 7px 0 0',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <main>{children}</main>
    </div>
  );
}
