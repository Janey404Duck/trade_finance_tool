import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LC All-in-Cost Comparison',
  description: 'Compare LC financing quotes across banks and trading houses.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
