'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        router.replace('/stella');
        return;
      }
      
      setIsChecking(false);
    };

    checkAuth();
  }, [router]);

  if (isChecking) {
    return null; // Don't render anything while checking
  }

  return <>{children}</>;
}

