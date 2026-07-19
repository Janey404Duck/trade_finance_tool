import { requireUser } from '@/lib/auth/requireUser';
import Link from 'next/link';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <header className="app-header">
        <Link className="brand" href="/dashboard">Trade Finance</Link>
        <nav aria-label="Primary navigation">
          <Link href="/compare">Compare</Link>
          <Link href="/quotations">Quotations</Link>
          <Link href="/templates">Templates</Link>
        </nav>
      </header>
      {children}
    </>
  );
}
