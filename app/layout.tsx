import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/planner/language-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Evening Bell · Make every small step count',
  description:
    'Plan around your time and energy, focus with a Pomodoro timer, and build momentum at your own pace.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
