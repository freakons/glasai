'use client';

import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Subscription {
  email: string;
  isEnabled: boolean;
}

type CardState =
  | { phase: 'loading' }
  | { phase: 'form'; email: string; error: string | null; saving: boolean }
  | { phase: 'active'; email: string; isEnabled: boolean; toggling: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  padding: '20px 24px',
  borderRadius: 'var(--r)',
  background: 'var(--glass)',
  border: '1px solid var(--border)',
};

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text3)',
  marginBottom: 12,
};

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border2)',
  background: 'var(--glass2)',
  color: 'var(--text)',
  fontFamily: 'var(--fm)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 18px',
  borderRadius: 10,
  border: '1px solid var(--border2)',
  background: 'var(--glass2)',
  color: 'var(--text2)',
  fontFamily: 'var(--fm)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
  transition: 'all 0.18s ease',
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--indigo, #6366f1)',
  borderColor: 'var(--indigo, #6366f1)',
  color: '#fff',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmailDigestCard() {
  const [state, setState] = useState<CardState>({ phase: 'loading' });

  // Load existing subscription on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/alerts/email-subscription');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;

        if (data.subscription?.email) {
          setState({
            phase: 'active',
            email: data.subscription.email,
            isEnabled: data.subscription.isEnabled,
            toggling: false,
          });
        } else {
          setState({ phase: 'form', email: '', error: null, saving: false });
        }
      } catch {
        if (!cancelled) setState({ phase: 'form', email: '', error: null, saving: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = useCallback(async (email: string) => {
    setState((s: CardState) => (s.phase === 'form' ? { ...s, saving: true, error: null } : s));

    try {
      const res = await fetch('/api/alerts/email-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState((s: CardState) => (s.phase === 'form' ? { ...s, saving: false, error: data.error || 'Failed to save' } : s));
        return;
      }
      setState({
        phase: 'active',
        email: data.subscription?.email || email,
        isEnabled: data.subscription?.isEnabled ?? true,
        toggling: false,
      });
    } catch {
      setState((s: CardState) => (s.phase === 'form' ? { ...s, saving: false, error: 'Network error. Try again.' } : s));
    }
  }, []);

  const handleToggle = useCallback(async (email: string, newEnabled: boolean) => {
    setState((s: CardState) => (s.phase === 'active' ? { ...s, toggling: true } : s));

    try {
      const res = await fetch('/api/alerts/email-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, isEnabled: newEnabled }),
      });
      if (res.ok) {
        setState((s: CardState) => (s.phase === 'active' ? { ...s, isEnabled: newEnabled, toggling: false } : s));
      } else {
        setState((s: CardState) => (s.phase === 'active' ? { ...s, toggling: false } : s));
      }
    } catch {
      setState((s: CardState) => (s.phase === 'active' ? { ...s, toggling: false } : s));
    }
  }, []);

  if (state.phase === 'loading') {
    return (
      <div style={CARD}>
        <div style={LABEL}>Daily Intelligence Digest</div>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>Loading...</p>
      </div>
    );
  }

  if (state.phase === 'active') {
    return (
      <div style={CARD}>
        <div style={LABEL}>Daily Intelligence Digest</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            display: 'inline-block',
            width: 8, height: 8, borderRadius: '50%',
            background: state.isEnabled ? 'var(--emerald, #34d399)' : 'var(--text3)',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--fd)', fontSize: 15, fontStyle: 'italic',
            color: 'var(--text)',
          }}>
            {state.isEnabled ? 'Daily brief enabled' : 'Daily brief paused'}
          </span>
        </div>

        <p style={{
          fontSize: 12, color: 'var(--text3)', lineHeight: 1.7, margin: '0 0 14px',
        }}>
          {state.isEnabled
            ? `Key alerts for your watched entities delivered daily to ${state.email}.`
            : `Digest paused for ${state.email}. You can re-enable it anytime.`}
        </p>

        <button
          style={BTN}
          onClick={() => handleToggle(state.email, !state.isEnabled)}
          disabled={state.toggling}
        >
          {state.toggling
            ? 'Updating...'
            : state.isEnabled ? 'Pause digest' : 'Resume digest'}
        </button>
      </div>
    );
  }

  // Form state
  return (
    <div style={CARD}>
      <div style={LABEL}>Daily Intelligence Digest</div>

      <p style={{
        fontFamily: 'var(--fd)', fontSize: 15, fontStyle: 'italic',
        color: 'var(--text)', marginBottom: 4, marginTop: 0,
      }}>
        Get daily intelligence digests
      </p>
      <p style={{
        fontSize: 12, color: 'var(--text3)', lineHeight: 1.7, margin: '0 0 14px',
      }}>
        Receive key alerts for your watched entities by email.
        One concise brief per day — no spam.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (state.phase === 'form' && state.email.trim()) {
            handleSubmit(state.email.trim());
          }
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
      >
        <div style={{ flex: 1 }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={state.email}
            onChange={(e) =>
              setState((s: CardState) => (s.phase === 'form' ? { ...s, email: e.target.value, error: null } : s))
            }
            style={INPUT}
            disabled={state.saving}
            autoComplete="email"
          />
          {state.error && (
            <p style={{
              fontSize: 11, color: 'var(--rose, #fb7185)', marginTop: 6, marginBottom: 0,
            }}>
              {state.error}
            </p>
          )}
        </div>
        <button
          type="submit"
          style={BTN_PRIMARY}
          disabled={state.saving || !state.email.trim()}
        >
          {state.saving ? 'Saving...' : 'Enable'}
        </button>
      </form>
    </div>
  );
}
