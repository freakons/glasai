import type { Metadata } from 'next';
import { SignalsBrowser } from './SignalsBrowser';

export const metadata: Metadata = {
  title: 'Signals',
  description: 'Intelligence signals detected across the AI ecosystem — model releases, funding events, regulatory shifts, and research breakthroughs.',
};

/** ISR: revalidate every 5 minutes */
export const revalidate = 300;

export default function SignalsPage() {
  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h1>Signals</h1>
          <p>INTELLIGENCE SIGNALS  ·  AI ECOSYSTEM  ·  REAL-TIME DETECTION</p>
        </div>
      </div>
      <SignalsBrowser />
    </>
  );
}
