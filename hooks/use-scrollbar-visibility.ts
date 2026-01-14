import { useState, useRef, useEffect } from 'react';

interface UseScrollbarVisibilityOptions {
  /**
   * Whether the container is expanded (for sidebar use case)
   * @default true
   */
  isExpanded?: boolean;
  /**
   * Whether to track hover state (for chat page use case)
   * @default false
   */
  trackHover?: boolean;
  /**
   * Timeout in milliseconds before hiding the scrollbar
   * @default 1000
   */
  hideDelay?: number;
}

interface UseScrollbarVisibilityReturn {
  /**
   * Whether the scrollbar should be visible
   */
  isVisible: boolean;
  /**
   * Whether the container is currently hovered (only if trackHover is true)
   */
  isHovered: boolean;
  /**
   * Props to spread on the scrollable element
   */
  scrollbarProps: {
    'data-expanded': string | boolean;
    'data-visible': boolean;
    'data-hovered'?: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onScroll: () => void;
  };
}

/**
 * Custom hook for managing scrollbar visibility with auto-hide functionality
 * 
 * @param options - Configuration options
 * @returns Scrollbar visibility state and event handlers
 */
export function useScrollbarVisibility(
  options: UseScrollbarVisibilityOptions = {}
): UseScrollbarVisibilityReturn {
  const {
    isExpanded = true,
    trackHover = false,
    hideDelay = 1000,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearScrollbarTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearScrollbarTimeout();
    setIsVisible(true);
    if (trackHover) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (trackHover) {
      setIsHovered(false);
    }
    // Only start timeout after mouse leaves
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, hideDelay);
  };

  const handleScroll = () => {
    clearScrollbarTimeout();
    setIsVisible(true);
    // Only set timeout if not currently hovered (when tracking hover)
    if (!trackHover || !isHovered) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, hideDelay);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearScrollbarTimeout();
    };
  }, []);

  const scrollbarProps: UseScrollbarVisibilityReturn['scrollbarProps'] = {
    'data-expanded': isExpanded,
    'data-visible': isVisible,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onScroll: handleScroll,
  };

  if (trackHover) {
    scrollbarProps['data-hovered'] = isHovered;
  }

  return {
    isVisible,
    isHovered,
    scrollbarProps,
  };
}

