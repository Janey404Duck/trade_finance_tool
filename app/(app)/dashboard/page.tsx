import Link from 'next/link';

const links = [
  { href: '/calculate', label: 'Calculate' },
  { href: '/quotes', label: 'Quotes' },
  { href: '/reference-rates', label: 'Reference Rates' },
  { href: '/issuing-bank-fees', label: 'Issuing Bank Fees' },
];

export default function DashboardPage() {
  return (
    <main className="page stack">
      <div>
        <h1>LC All-in-Cost Comparison</h1>
        <p>Run trade finance cost comparisons and maintain quote data.</p>
      </div>
      <section className="grid">
        {links.map((link) => (
          <Link className="panel" href={link.href} key={link.href}>
            <strong>{link.label}</strong>
          </Link>
        ))}
      </section>
    </main>
  );
}
