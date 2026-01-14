import type { Metadata } from 'next';
import { StellaLayoutShell } from '@/components/stella-layout-shell';

export const metadata: Metadata = {
  title: 'Ask Stella',
  description:
    'NOT for clinical use. Educational discussion only. Stanford MSK AI 2025 / Do, Yoon, Beaulieu',
  icons: [
    { rel: 'icon', url: '/icon-light.png', media: '(prefers-color-scheme: light)' },
    { rel: 'icon', url: '/icon-dark.png', media: '(prefers-color-scheme: dark)' },
  ],
};

export default function StellaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server layout simply renders the client shell; metadata is exported here.
  return <StellaLayoutShell>{children}</StellaLayoutShell>;
}