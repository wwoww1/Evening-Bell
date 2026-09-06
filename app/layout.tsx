import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '晚钟 · 让每一小步都有方向',
  description: '根据每天的时间与精力安排目标，用番茄钟专注，用温和的陪伴坚持。',
  manifest: '/manifest.webmanifest',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
