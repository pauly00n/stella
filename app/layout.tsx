import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { AccentProvider } from '@/components/accent-provider';
import ConditionalLayout from '@/components/conditional-layout';

export const metadata: Metadata = {
    title: 'Paul Yoon',
    description: "Paul Yoon - Stanford University Undergraduate studying Mathematics and Computer Science",
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
            <head>
                <script
                    id="schema-person"
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "Person",
                            "name": "Paul Yoon",
                            "affiliation": {
                                "@type": "CollegeOrUniversity",
                                "name": "Stanford University"
                            },
                            "url": "https://paulyoon.xyz"
                        }),
                    }}
                />
            </head>
            <body className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="light"
                    enableSystem
                    disableTransitionOnChange
                >
                    <AccentProvider>
                        <ConditionalLayout>
                            {children}
                        </ConditionalLayout>
                    </AccentProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
