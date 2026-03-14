'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { getUserId } from '@/lib/userId';

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
// localStorage helpers (fallback for unauthenticated users)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'omterminal:watchlist';
const MIGRATED_KEY = 'omterminal:watchlist_migrated';

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
// External store for cross-component sync (localStorage mode)
// ─────────────────────────────────────────────────────────────────────────────

let localSnapshot: WatchedEntity[] = readStore();

function subscribeLocal(cb: () => void) {
  const handler = () => {
    localSnapshot = readStore();
    cb();
  };
  window.addEventListener('watchlist-change', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('watchlist-change', handler);
    window.removeEventListener('storage', handler);
  };
}

function getLocalSnapshot() {
  return localSnapshot;
}

function getServerSnapshot() {
  return [] as WatchedEntity[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-backed external store (for authenticated users)
//
// Uses a module-level store so all hook instances share the same data.
// Mutations apply optimistically then sync with the server.
// ─────────────────────────────────────────────────────────────────────────────

let serverEntities: WatchedEntity[] = [];
let serverListeners = new Set<() => void>();
let serverFetched = false;
let serverFetching = false;

function notifyServerListeners() {
  for (const cb of serverListeners) cb();
}

function subscribeServer(cb: () => void) {
  serverListeners.add(cb);
  return () => { serverListeners.delete(cb); };
}

function getServerEntities() {
  return serverEntities;
}

function setServerEntities(entities: WatchedEntity[]) {
  serverEntities = entities;
  notifyServerListeners();
}

async function fetchServerWatchlist(): Promise<WatchedEntity[]> {
  if (serverFetching) return serverEntities;
  serverFetching = true;
  try {
    const res = await fetch('/api/watchlist', { credentials: 'same-origin' });
    if (!res.ok) return serverEntities;
    const data = await res.json();
    const entities: WatchedEntity[] = Array.isArray(data.entities) ? data.entities : [];
    serverFetched = true;
    setServerEntities(entities);
    return entities;
  } catch {
    return serverEntities;
  } finally {
    serverFetching = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage → server migration
// ─────────────────────────────────────────────────────────────────────────────

async function migrateLocalStorageToServer(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Only migrate once per browser
  if (localStorage.getItem(MIGRATED_KEY)) return;

  const localEntities = readStore();
  if (localEntities.length === 0) {
    localStorage.setItem(MIGRATED_KEY, 'true');
    return;
  }

  try {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entities: localEntities.map((e) => ({
          slug: e.slug,
          name: e.name,
          sector: e.sector,
          country: e.country,
          addedAt: e.addedAt,
        })),
      }),
    });

    if (res.ok) {
      localStorage.setItem(MIGRATED_KEY, 'true');
      // Re-fetch server state to get the merged result
      await fetchServerWatchlist();
    }
  } catch {
    // Migration failed — will retry on next load
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const [useServer, setUseServer] = useState(false);
  const initRef = useRef(false);

  // Determine mode and initialize server store on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const uid = getUserId(); // creates cookie if needed
    if (uid) {
      setUseServer(true);
      // Fetch server watchlist, then attempt migration
      fetchServerWatchlist().then(() => migrateLocalStorageToServer());
    }
  }, []);

  // Subscribe to the appropriate store
  const localEntities = useSyncExternalStore(
    subscribeLocal,
    getLocalSnapshot,
    getServerSnapshot,
  );

  const serverEntityList = useSyncExternalStore(
    subscribeServer,
    getServerEntities,
    getServerSnapshot,
  );

  const entities = useServer ? serverEntityList : localEntities;

  // ── Add ──────────────────────────────────────────────────────────────────

  const add = useCallback(
    (entity: Omit<WatchedEntity, 'addedAt'>) => {
      const now = new Date().toISOString();
      const newEntity: WatchedEntity = { ...entity, addedAt: now };

      if (useServer) {
        // Optimistic update
        if (serverEntities.some((e) => e.slug === entity.slug)) return;
        setServerEntities([...serverEntities, newEntity]);

        // Fire and forget — rollback on failure
        fetch('/api/watchlist', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: entity.slug,
            name: entity.name,
            sector: entity.sector,
            country: entity.country,
          }),
        }).catch(() => {
          // Rollback optimistic update
          setServerEntities(serverEntities.filter((e) => e.slug !== entity.slug));
        });
      } else {
        const current = readStore();
        if (current.some((e) => e.slug === entity.slug)) return;
        writeStore([...current, newEntity]);
      }
    },
    [useServer],
  );

  // ── Remove ───────────────────────────────────────────────────────────────

  const remove = useCallback(
    (slug: string) => {
      if (useServer) {
        // Optimistic update
        const previous = [...serverEntities];
        setServerEntities(serverEntities.filter((e) => e.slug !== slug));

        fetch(`/api/watchlist?slug=${encodeURIComponent(slug)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        }).catch(() => {
          // Rollback
          setServerEntities(previous);
        });
      } else {
        writeStore(readStore().filter((e) => e.slug !== slug));
      }
    },
    [useServer],
  );

  // ── isWatched ────────────────────────────────────────────────────────────

  const isWatched = useCallback(
    (slug: string) => entities.some((e) => e.slug === slug),
    [entities],
  );

  // ── Toggle ───────────────────────────────────────────────────────────────

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
