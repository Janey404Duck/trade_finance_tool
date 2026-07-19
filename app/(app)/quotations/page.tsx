const samples = [
  ['SCB-QT-2026-001', 'Standard Chartered', 'USD', 'Active'],
  ['CITI-QT-2026-003', 'Citi', 'USD', 'Active'],
  ['BOC-QT-2026-005', 'Bank of China', 'USD', 'Draft'],
];

export default function QuotationsPage() {
  return (
    <main className="page stack-lg">
      <header className="section-header">
        <div>
          <p className="eyebrow">Quotation engine</p>
          <h1>Quotation library</h1>
          <p>Internal UUIDs stay invisible. References, versions, applicability, and pricing remain distinct.</p>
        </div>
        <button className="button" type="button">New quotation</button>
      </header>
      <section className="card stack">
        <div className="filter-row">
          <label className="field"><span>Institution</span><select><option>All</option></select></label>
          <label className="field"><span>Currency</span><select><option>All</option></select></label>
          <label className="field"><span>Product</span><select><option>LC financing</option></select></label>
          <label className="field"><span>Status</span><select><option>All</option></select></label>
        </div>
        <div>
          {samples.map(([reference, institution, currency, status]) => (
            <div className="quotation-row" key={reference}>
              <strong>{reference}</strong>
              <span>{institution}</span>
              <span>{currency}</span>
              <span className="badge">{status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
