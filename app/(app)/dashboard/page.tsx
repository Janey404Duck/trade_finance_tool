import Link from 'next/link';

const links = [
  {
    href: '/compare',
    label: 'Compare a scenario',
    description: 'Resolve the trade timeline, choose financing dimensions, and compare applicable quotations.',
  },
  {
    href: '/quotations',
    label: 'Quotation library',
    description: 'Maintain institution quotations, versioned pricing records, and applicability conditions.',
  },
  {
    href: '/templates',
    label: 'Trade templates',
    description: 'Set reusable event relationships, maturity conventions, and pricing-period defaults.',
  },
];

export default function DashboardPage() {
  return (
    <main className="page stack-lg">
      <section className="hero">
        <p className="eyebrow">Trade finance workspace</p>
        <h1>Model the trade. Price the overlays.</h1>
        <p>Transaction events form one timeline. Confirmation and early-payment financing stay independent.</p>
      </section>
      <section className="card-grid" aria-label="Workspace areas">
        {links.map((link) => (
          <Link className="card card-link" href={link.href} key={link.href}>
            <h2>{link.label}</h2>
            <p>{link.description}</p>
            <span>Open →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
