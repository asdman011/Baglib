import type { Metadata } from 'next';
import { Amiri, Tajawal, Reem_Kufi } from 'next/font/google';
import './globals.css';

const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
});

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-tajawal',
  display: 'swap',
});

const reemKufi = Reem_Kufi({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-reem-kufi',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'بغلب - Design System Playground',
  description: 'Playground for Baghdad Library Design System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${amiri.variable} ${tajawal.variable} ${reemKufi.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col antialiased bg-[var(--bg-canvas)] text-[var(--text-main)] font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

