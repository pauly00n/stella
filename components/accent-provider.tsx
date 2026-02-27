'use client';

import { useEffect } from 'react';

export const ACCENT_LS_KEY = 'stella-accent-color';
export const ACCENT_CHANGE_EVENT = 'stellaAccentChange';

export interface AccentColorDef {
  id: string;
  hsl: string;       // e.g. "0 84% 60%"
  hslDark: string;   // slightly darker for hover
  hslMuted: string;  // very low opacity version for bubble bg
  hslText: string;   // dark tint for text on muted bg (like text-red-950)
}

export const ACCENT_COLOR_DEFS: AccentColorDef[] = [
  {
    id: 'red',
    hsl:      '0 84% 60%',
    hslDark:  '0 84% 50%',
    hslMuted: '0 84% 60% / 0.10',
    hslText:  '0 84% 15%',
  },
  {
    id: 'orange',
    hsl:      '25 95% 53%',
    hslDark:  '25 95% 43%',
    hslMuted: '25 95% 53% / 0.10',
    hslText:  '25 95% 15%',
  },
  {
    id: 'green',
    hsl:      '142 71% 45%',
    hslDark:  '142 71% 35%',
    hslMuted: '142 71% 45% / 0.10',
    hslText:  '142 71% 12%',
  },
  {
    id: 'blue',
    hsl:      '217 91% 60%',
    hslDark:  '217 91% 50%',
    hslMuted: '217 91% 60% / 0.10',
    hslText:  '217 91% 15%',
  },
  {
    id: 'purple',
    hsl:      '271 81% 56%',
    hslDark:  '271 81% 46%',
    hslMuted: '271 81% 56% / 0.10',
    hslText:  '271 81% 15%',
  },
];

export function applyAccentById(id: string) {
  const def = ACCENT_COLOR_DEFS.find((c) => c.id === id) ?? ACCENT_COLOR_DEFS[0];
  const root = document.documentElement;
  root.style.setProperty('--stella-accent',       `hsl(${def.hsl})`);
  root.style.setProperty('--stella-accent-dark',  `hsl(${def.hslDark})`);
  root.style.setProperty('--stella-accent-muted', `hsl(${def.hslMuted})`);
  root.style.setProperty('--stella-accent-text',  `hsl(${def.hslText})`);
}

/**
 * Reads the saved accent from localStorage on mount, applies it, and
 * listens for live changes dispatched by the settings modal.
 * A <style> tag handles the .dark class swap purely in CSS so theme
 * changes are instant with no JS re-render.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem(ACCENT_LS_KEY) ?? 'red';
    applyAccentById(saved);

    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      applyAccentById(id);
    };
    window.addEventListener(ACCENT_CHANGE_EVENT, handler);
    return () => window.removeEventListener(ACCENT_CHANGE_EVENT, handler);
  }, []);

  return <>{children}</>;
}
