'use client';

import { createContext, useContext } from 'react';

export interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const CommandPaletteContext = createContext<CommandPaletteState>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}
