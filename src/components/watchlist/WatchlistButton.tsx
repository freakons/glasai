'use client';

import { useWatchlist } from '@/hooks/useWatchlist';

interface WatchlistButtonProps {
  slug: string;
  name: string;
  sector?: string;
  country?: string;
}

export function WatchlistButton({ slug, name, sector, country }: WatchlistButtonProps) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(slug);

  return (
    <button
      onClick={() => toggle({ slug, name, sector, country })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 10,
        border: watched
          ? '1px solid rgba(79,70,229,0.5)'
          : '1px solid var(--border2)',
        background: watched
          ? 'rgba(79,70,229,0.12)'
          : 'var(--glass2)',
        color: watched ? 'var(--indigo-l)' : 'var(--text2)',
        fontFamily: 'var(--fm)',
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={13}
        height={13}
        fill={watched ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      {watched ? 'Watching' : 'Watch Entity'}
    </button>
  );
}
