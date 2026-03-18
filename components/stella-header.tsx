'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function StellaHeader() {
  return (
    <header className="w-full border-b border-border bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-4xl">
        <Link href="/">
          <h1 
            className="text-2xl font-normal text-foreground font-serif cursor-pointer select-none" 
            style={{ fontFamily: 'Garamond, serif', fontWeight: 570 }}
          >
            Ask Stella<span style={{ color: 'var(--stella-accent)' }}>!</span>
          </h1>
        </Link>
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <Button variant="default" className="text-white" style={{ backgroundColor: 'var(--stella-accent)' }} asChild>
            <Link href="/login">Login</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

