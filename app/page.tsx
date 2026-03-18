'use client';

import dynamic from 'next/dynamic';

const Chatbox = dynamic(() => import('@/components/chatbox').then(m => m.Chatbox), { ssr: false });

export default function StellaPage() {
  return (
    <div className="flex items-start justify-center px-4 py-12 h-full min-h-screen">
      <div className="w-full max-w-2xl flex flex-col" style={{ marginTop: 'calc(50vh - 150px)' }}>
        <Chatbox />
      </div>
    </div>
  );
}
