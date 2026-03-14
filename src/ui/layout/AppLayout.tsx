import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MainPanel } from './MainPanel';
import { ContextPanel } from './ContextPanel';
import { CommandBar } from './CommandBar';
import type { Signal } from '@/data/mockSignals';

interface AppLayoutProps {
  children: ReactNode;
  /** Live signals for the context panel — pass from server data. */
  signals?: Signal[];
}

/**
 * AppLayout — three-panel intelligence layout.
 *
 * Structure:
 *   ┌─────────┬──────────────────┬──────────────┐
 *   │ Sidebar │   Main Panel     │ Context Panel│
 *   │  (nav)  │   (content)      │  (context)   │
 *   ├─────────┴──────────────────┴──────────────┤
 *   │              Command Bar                  │
 *   └───────────────────────────────────────────┘
 *
 * Responsive:
 *   < 1100px — context panel hidden
 *   < 768px  — sidebar hidden, single column
 */
export function AppLayout({ children, signals }: AppLayoutProps) {
  return (
    <div className="il-grid">
      <Sidebar />
      <MainPanel>{children}</MainPanel>
      <ContextPanel signals={signals} />
      <CommandBar />
    </div>
  );
}
