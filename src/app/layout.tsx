import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { siteConfig } from '@/config/site';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Ticker } from '@/components/layout/Ticker';
import { Footer } from '@/components/layout/Footer';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider';
import '@/styles/globals.css';

const instrumentSerif = localFont({
  src: [
    { path: '../fonts/InstrumentSerif-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/InstrumentSerif-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
});

const dmSans = localFont({
  src: [
    { path: '../fonts/DMSans-Light.woff2', weight: '300', style: 'normal' },
    { path: '../fonts/DMSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/DMSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/DMSans-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/DMSans-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
});

const dmMono = localFont({
  src: [
    { path: '../fonts/DMMono-Light.woff2', weight: '300', style: 'normal' },
    { path: '../fonts/DMMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/DMMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-dm-mono',
  display: 'swap',
});

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
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%234f46e5'/><stop offset='100%25' stop-color='%2306b6d4'/></linearGradient></defs><rect width='32' height='32' rx='7' fill='url(%23g)'/><text y='22' x='5' font-size='14' font-family='Georgia,serif' fill='white' font-weight='900'>Om</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <head>
        <meta name="theme-color" content="#05050f" />
      </head>
      <body>
        <AmbientBackground />
        <div className="app">
          <Sidebar />
          <main className="main-content">
            <Topbar title="Om" highlight="terminal" />
            <Ticker />
            <div className="content page-enter">
              {children}
            </div>
          </main>
        </div>
        <Footer />
        <OnboardingProvider />
      </body>
    </html>
  );
}
