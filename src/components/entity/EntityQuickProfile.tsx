'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { slugify } from '@/utils/sanitize';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface QuickProfileData {
  name: string;
  sector: string | null;
  country: string | null;
  signals7d: number;
  eventsTotal: number;
  avgConfidence: number;
  latestSignal: string | null;
}

interface EntityQuickProfileProps {
  /** The entity name to display and fetch profile for. */
  entityName: string;
  /** Optional className applied to the trigger element. */
  className?: string;
  /** Optional inline styles for the trigger element. */
  style?: React.CSSProperties;
  /** Children to render as the trigger. If omitted, renders entityName text. */
  children?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EntityQuickProfile({
  entityName,
  className,
  style,
  children,
}: EntityQuickProfileProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QuickProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch profile data on first open
  const fetchProfile = useCallback(async () => {
    if (data || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/entities/${encodeURIComponent(entityName)}/quick-profile`,
      );
      if (!res.ok) throw new Error('not found');
      const json = await res.json();
      if (!json.ok) throw new Error('bad response');
      setData(json as QuickProfileData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [entityName, data, loading]);

  // Toggle popover on click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const next = !open;
      setOpen(next);
      if (next) fetchProfile();
    },
    [open, fetchProfile],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const slug = slugify(entityName);

  return (
    <span ref={containerRef} className="eqp-container" style={style}>
      <button
        type="button"
        className={`eqp-trigger${className ? ` ${className}` : ''}`}
        onClick={handleClick}
        aria-expanded={open}
        title={`Quick profile: ${entityName}`}
      >
        {children ?? entityName}
      </button>

      {open && (
        <div ref={cardRef} className="eqp-card" role="dialog" aria-label={`${entityName} quick profile`}>
          {loading && (
            <div className="eqp-loading">Loading…</div>
          )}

          {error && (
            <div className="eqp-error">Profile unavailable</div>
          )}

          {data && (
            <>
              <div className="eqp-header">
                <span className="eqp-name">{data.name}</span>
                {(data.sector || data.country) && (
                  <span className="eqp-meta">
                    {[data.sector, data.country].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>

              <div className="eqp-stats">
                <div className="eqp-stat">
                  <span className="eqp-stat-value">{data.signals7d}</span>
                  <span className="eqp-stat-label">Signals (7d)</span>
                </div>
                <div className="eqp-stat">
                  <span className="eqp-stat-value">{data.eventsTotal}</span>
                  <span className="eqp-stat-label">Events</span>
                </div>
                <div className="eqp-stat">
                  <span className="eqp-stat-value">
                    {data.avgConfidence > 0 ? `${Math.round(data.avgConfidence)}%` : '—'}
                  </span>
                  <span className="eqp-stat-label">Avg confidence</span>
                </div>
              </div>

              {data.latestSignal && (
                <div className="eqp-latest">
                  <span className="eqp-latest-label">Latest signal</span>
                  <span className="eqp-latest-title">{data.latestSignal}</span>
                </div>
              )}

              <Link
                href={`/entity/${slug}`}
                className="eqp-dossier-link"
                onClick={() => setOpen(false)}
              >
                View full dossier →
              </Link>
            </>
          )}
        </div>
      )}
    </span>
  );
}
