import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trade Finance Workspace',
  description: 'Model trade timelines and compare independent financing quotations.',
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
