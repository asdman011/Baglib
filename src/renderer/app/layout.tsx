import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'بغلب',
  description: 'تطبيق سطح المكتب للقراءة وادارة الكتب',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased bg-[#efece4] text-[#4a1d25] font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
