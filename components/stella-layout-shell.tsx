'use client';

import { useEffect, useState } from 'react';
import StellaSidebar from '@/components/stella-sidebar';
import StellaHeader from '@/components/stella-header';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

function getInitialSidebarExpanded(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem('stella-sidebar-expanded');
  return saved !== null ? saved === 'true' : true;
}

export function StellaLayoutShell({ children }: { children: React.ReactNode }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(getInitialSidebarExpanded);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

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

  // Persist sidebar state changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('stella-sidebar-expanded', String(isSidebarExpanded));
  }, [isSidebarExpanded]);

  // While auth is loading, render a sidebar skeleton so the content area doesn't shift on resolve.
  if (authLoading) {
    const sidebarWidth = isSidebarExpanded ? 'w-64' : 'w-12';
    const marginLeft = isSidebarExpanded ? 'ml-64' : 'ml-12';
    return (
      <div className="min-h-screen">
        <div className={`fixed inset-y-0 left-0 ${sidebarWidth} border-r border-border bg-card z-40 flex flex-col overflow-hidden h-screen`}>
          {/* Title + expand button row */}
          <div className="flex justify-between items-center">
            <div className={`pt-1 pb-0 ${isSidebarExpanded ? 'pl-0.5' : 'pl-1'} flex justify-start`}>
              {isSidebarExpanded ? (
                <h3 className="text-2xl font-normal text-foreground px-3 py-2 font-serif select-none" style={{ fontFamily: 'Garamond, serif', fontWeight: 570 }}>
                  Ask Stella<span style={{ color: 'var(--stella-accent)' }}>!</span>
                </h3>
              ) : (
                <h3 className="text-2xl font-light text-muted-foreground py-2 opacity-0">​ </h3>
              )}
            </div>
            <div className={`flex justify-end ${isSidebarExpanded ? 'pr-2 py-3' : 'pr-3 py-3 pb-3'}`}>
              <div className="w-10 h-10 flex items-center justify-center text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>
              </div>
            </div>
          </div>
          {/* New chat button */}
          <div className={`justify-start ${isSidebarExpanded ? 'px-2' : 'px-1'}`}>
            <div className={`w-full h-10 flex items-center ${isSidebarExpanded ? 'pr-3 pl-1' : 'pr-2 pl-2'}`}>
              <div className="h-6 w-6 mr-2 flex items-center justify-center text-white rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--stella-accent)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </div>
              {isSidebarExpanded && <span className="text-base font-normal text-muted-foreground">New chat</span>}
            </div>
          </div>
          {/* Search button */}
          <div className={`pb-2 justify-start ${isSidebarExpanded ? 'px-2' : 'px-1'}`}>
            <div className={`w-full h-10 flex items-center ${isSidebarExpanded ? 'pr-2 pl-0' : 'pr-1 pl-1'}`}>
              <div className="h-8 w-8 mr-1 flex items-center justify-center text-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              {isSidebarExpanded && <span className="text-base font-normal text-muted-foreground">Search</span>}
            </div>
          </div>
          {/* Chat list skeletons */}
          <div className="flex-1 flex flex-col min-h-0">
            {isSidebarExpanded && <span className="text-sm font-medium text-muted-foreground px-4 pt-4 pb-1">Recent chats</span>}
            <div className="flex-1 overflow-hidden p-2">
              <div className="space-y-1">
                {Array.from({ length: 12 }).map((_, i) => {
                  const widths = [95, 85, 100, 78, 92, 88, 100, 80, 87, 93, 96, 82];
                  return (
                    <div key={i} className="w-full py-2 px-2 flex justify-start">
                      <Skeleton
                        className="h-5 rounded"
                        style={{ width: isSidebarExpanded ? `${widths[i]}%` : '0%', opacity: isSidebarExpanded ? 1 : 0 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* User row */}
          <div className={`${isSidebarExpanded ? 'border-t border-border' : 'pt-3'}`}>
            <div className={`w-full ${isSidebarExpanded ? 'h-16' : 'h-16'} flex items-center px-1`}>
              <div className={`flex items-center w-full ${isSidebarExpanded ? 'pl-3' : ''}`}>
                <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                {isSidebarExpanded && (
                  <div className="flex flex-col pl-2 gap-1 min-w-0">
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton className="h-3 w-32 rounded" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className={`min-h-screen ${marginLeft}`}>{children}</div>
      </div>
    );
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

