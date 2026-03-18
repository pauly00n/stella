import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { AccentProvider } from '@/components/accent-provider';
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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="light"
                    enableSystem
                    disableTransitionOnChange
                >
                    <AccentProvider>
                        <StellaLayoutShell>
                            {children}
                        </StellaLayoutShell>
                    </AccentProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
