'use client';

import { useEffect, useState } from 'react';
import StellaSidebar from '@/components/stella-sidebar';
import StellaHeader from '@/components/stella-header';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export function StellaLayoutShell({ children }: { children: React.ReactNode }) {
  // Sidebar expanded/collapsed state with persistence in localStorage.
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(true);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Avoid hydration issues: only mark mounted on client.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load auth state on client and listen for changes
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!error) {
        setUser(user ?? null);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Hydration-safe load from localStorage after mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('stella-sidebar-expanded');
    if (saved !== null) {
      setIsSidebarExpanded(saved === 'true');
    }
  }, []);

  // Persist sidebar state changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('stella-sidebar-expanded', String(isSidebarExpanded));
  }, [isSidebarExpanded]);

  // During SSR / first client render, or while auth is loading, render children without sidebar.
  if (!mounted || authLoading) {
    return <div className="min-h-screen">{children}</div>;
  }

  // If no user, render the public Stella header + content (no sidebar, no chats).
  if (!user) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <StellaHeader />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    );
  }

  // Authenticated: render sidebar layout
  return (
    <div className="min-h-screen">
      <StellaSidebar
        isExpanded={isSidebarExpanded}
        onExpandedChange={setIsSidebarExpanded}
      />
      <div
        className={`min-h-screen transition-[margin-left] duration-200 ${
          isSidebarExpanded ? 'ml-64' : 'ml-12'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

