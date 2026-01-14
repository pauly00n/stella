'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';

export function ChatLoadingSkeleton() {
  const { scrollbarProps: messagesScrollbarProps } = useScrollbarVisibility({
    isExpanded: true,
    trackHover: true,
  });
  
  const { scrollbarProps: imagesScrollbarProps } = useScrollbarVisibility({
    isExpanded: true,
    trackHover: true,
  });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat Interface - 70% width */}
      <div className="flex flex-col border-r border-border h-screen overflow-hidden items-center" style={{ flex: '7', minWidth: 0 }}>
        <div 
          className="flex-1 overflow-y-auto py-4 px-12 min-h-0 w-full"
        >
          <div className="flex flex-col items-center space-y-6 w-full">
            <div className="py-4"></div>
            {/* User message skeleton - top right, shorter */}
            <Skeleton className="h-12 max-w-[500px] w-full rounded bg-red-500/10 transition-all duration-500 self-end" />

            <div className="py-2"></div>
            {/* Assistant message skeleton - centered, left-aligned text */}
            {Array.from({ length: 9 }).map((_, index) => {
              // Variable widths between 60% and 100%
              const widths = [100, 90, 70, 95, 75, 88, 92, 80, 96];
              const width = widths[index % widths.length];
              return (
                <Skeleton
                  key={index}
                  className={`h-4 rounded mb-5 transition-all duration-500 self-start`}
                  style={{ width: `${width}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Images Column - 30% width, sticky position */}
      <div className="flex flex-col border-l border-border h-screen overflow-hidden bg-card sticky top-0" style={{ flex: '3', minWidth: 0 }}>
        <div 
          className="flex-1 overflow-y-auto p-4 min-h-0 stella-scrollbar"
          {...imagesScrollbarProps}
        >
          <div className="flex flex-col gap-4 h-full">
            {/* 3 box skeletons for images - each takes ~1/3 of available height */}
            <Skeleton className="flex-1 w-full rounded transition-all duration-500" />
            <Skeleton className="flex-1 w-full rounded transition-all duration-500" />
            <Skeleton className="flex-1 w-full rounded transition-all duration-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

