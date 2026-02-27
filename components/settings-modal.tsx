'use client';

import { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  ACCENT_LS_KEY,
  ACCENT_CHANGE_EVENT,
  ACCENT_COLOR_DEFS,
  applyAccentById,
} from '@/components/accent-provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsTab = 'general' | 'personalization' | 'edit-profile';

export type AccentColor = 'red' | 'orange' | 'green' | 'blue' | 'purple';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  userName?: string;
}

// ---------------------------------------------------------------------------
// Accent color swatch config (display only — source of truth is accent-provider)
// ---------------------------------------------------------------------------

const ACCENT_SWATCHES: { id: AccentColor; label: string; swatch: string }[] = [
  { id: 'red',    label: 'Red',    swatch: 'bg-red-500'    },
  { id: 'orange', label: 'Orange', swatch: 'bg-orange-500' },
  { id: 'green',  label: 'Green',  swatch: 'bg-green-500'  },
  { id: 'blue',   label: 'Blue',   swatch: 'bg-blue-500'   },
  { id: 'purple', label: 'Purple', swatch: 'bg-purple-500' },
];

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: 'general',         label: 'General'         },
  { id: 'personalization', label: 'Personalization' },
  { id: 'edit-profile',    label: 'Edit Profile'    },
];

// ---------------------------------------------------------------------------
// General panel
// ---------------------------------------------------------------------------

function GeneralPanel() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">General</h2>
      <p className="text-sm text-muted-foreground">General settings coming soon.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personalization panel
// ---------------------------------------------------------------------------

function PersonalizationPanel() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [accentColor, setAccentColor] = useState<AccentColor>('red');

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(ACCENT_LS_KEY) as AccentColor | null;
    if (saved && ACCENT_COLOR_DEFS.find((c) => c.id === saved)) {
      setAccentColor(saved);
    }
  }, []);

  const handleAccent = (color: AccentColor) => {
    setAccentColor(color);
    localStorage.setItem(ACCENT_LS_KEY, color);
    applyAccentById(color);
    window.dispatchEvent(new CustomEvent(ACCENT_CHANGE_EVENT, { detail: color }));
  };

  const currentTheme = mounted ? theme : 'light';

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-base font-semibold text-foreground">Personalization</h2>

      {/* Appearance */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Appearance</p>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm border transition-colors capitalize',
                currentTheme === t
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Accent Color</p>
        <div className="flex gap-3">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c.id}
              title={c.label}
              onClick={() => handleAccent(c.id)}
              className={cn(
                'w-7 h-7 rounded-full transition-all',
                c.swatch,
                accentColor === c.id
                  ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                  : 'opacity-70 hover:opacity-100 hover:scale-105'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Profile panel
// ---------------------------------------------------------------------------

function EditProfilePanel({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Keep in sync if parent re-renders with a new name
  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStatus('saving');
    setErrorMsg('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      });
      if (error) throw error;
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-base font-semibold text-foreground">Edit Profile</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-name" className="text-sm font-medium text-foreground">
          Display Name
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setStatus('idle'); }}
          placeholder="Your name"
          className={cn(
            'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-foreground/30',
            'transition-colors'
          )}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={status === 'saving' || !name.trim()}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
            'bg-foreground text-background',
            'hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
        )}
        {status === 'error' && (
          <span className="text-sm text-red-500">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function SettingsModal({ open, onClose, userName = '' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogPrimitive.Portal>
        {/* Overlay — matches alert-dialog bg-black/60 */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />

        {/* Modal panel — 50vw wide, 40vh tall, centered */}
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[50vw] h-[40vh] min-w-[560px] min-h-[360px]',
            'bg-background border border-border rounded-lg shadow-xl',
            'flex overflow-hidden',
            'duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          {/* Left sidebar nav */}
          <nav className="relative w-44 flex-shrink-0 border-r border-border bg-card flex flex-col pt-10 pb-4 px-2 gap-1">
            {/* X close button — top-left of sidebar */}
            <DialogPrimitive.Close
              onClick={onClose}
              className="absolute left-3 top-3 rounded-sm opacity-60 transition-opacity hover:opacity-100 focus:outline-none"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                  activeTab === item.id
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right content pane */}
          <div className="flex-1 flex flex-col min-w-0 p-6 pt-8 overflow-y-auto">
            {activeTab === 'general'         && <GeneralPanel />}
            {activeTab === 'personalization' && <PersonalizationPanel />}
            {activeTab === 'edit-profile'    && <EditProfilePanel initialName={userName} />}
          </div>

          {/* Required for a11y — visually hidden title */}
          <DialogPrimitive.Title className="sr-only">Settings</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Application settings panel
          </DialogPrimitive.Description>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
