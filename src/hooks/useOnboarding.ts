'use client';

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'omterminal:onboardingCompleted';

function readCompleted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let snapshot = readCompleted();

function subscribe(cb: () => void) {
  const handler = () => {
    snapshot = readCompleted();
    cb();
  };
  window.addEventListener('onboarding-change', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('onboarding-change', handler);
    window.removeEventListener('storage', handler);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return true; // assume completed on server to avoid flash
}

export function useOnboarding() {
  const completed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    snapshot = true;
    window.dispatchEvent(new Event('onboarding-change'));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    snapshot = false;
    window.dispatchEvent(new Event('onboarding-change'));
  }, []);

  return { completed, markCompleted, reset } as const;
}
