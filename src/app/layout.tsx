import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Ticker } from '@/components/layout/Ticker';
import { Footer } from '@/components/layout/Footer';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — AI Intelligence Terminal | Regulation, Models, Funding & Policy`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — AI Intelligence Terminal`,
    description: 'Track AI regulation, models, funding & policy. Built for teams that can\'t afford to be surprised.',
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%234f46e5'/><stop offset='100%25' stop-color='%2306b6d4'/></linearGradient></defs><rect width='32' height='32' rx='7' fill='url(%23g)'/><text y='22' x='5' font-size='14' font-family='Georgia,serif' fill='white' font-weight='900'>OM</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#05050f" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AmbientBackground />
        <div className="app">
          <Sidebar />
          <main className="main-content">
            <Topbar title="OM" highlight="Terminal" />
            <Ticker />
            <div className="content page-enter">
              {children}
            </div>
          </main>
        </div>
        <Footer />
      </body>
    </html>
  );
}
