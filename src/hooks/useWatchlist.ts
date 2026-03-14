'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchedEntity {
  slug: string;
  name: string;
  sector?: string;
  country?: string;
  addedAt: string; // ISO date
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage key & helpers
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'omterminal:watchlist';

function readStore(): WatchedEntity[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchedEntity[]) : [];
  } catch {
    return [];
  }
}

function writeStore(entities: WatchedEntity[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entities));
  window.dispatchEvent(new Event('watchlist-change'));
}

// ─────────────────────────────────────────────────────────────────────────────
// External store for cross-component sync
// ─────────────────────────────────────────────────────────────────────────────

let snapshot: WatchedEntity[] = readStore();

function subscribe(cb: () => void) {
  const handler = () => {
    snapshot = readStore();
    cb();
  };
  window.addEventListener('watchlist-change', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('watchlist-change', handler);
    window.removeEventListener('storage', handler);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return [] as WatchedEntity[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const entities = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((entity: Omit<WatchedEntity, 'addedAt'>) => {
    const current = readStore();
    if (current.some((e) => e.slug === entity.slug)) return;
    writeStore([...current, { ...entity, addedAt: new Date().toISOString() }]);
  }, []);

  const remove = useCallback((slug: string) => {
    writeStore(readStore().filter((e) => e.slug !== slug));
  }, []);

  const isWatched = useCallback(
    (slug: string) => entities.some((e) => e.slug === slug),
    [entities],
  );

  const toggle = useCallback(
    (entity: Omit<WatchedEntity, 'addedAt'>) => {
      if (entities.some((e) => e.slug === entity.slug)) {
        remove(entity.slug);
      } else {
        add(entity);
      }
    },
    [entities, add, remove],
  );

  return { entities, add, remove, isWatched, toggle } as const;
}
