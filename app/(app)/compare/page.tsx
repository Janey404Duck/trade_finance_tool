const timeline = [
  ['Trade start / PO', 'Day 0', 'Canonical origin'],
  ['LC issuance', 'Day 35', '10 days before shipment'],
  ['Shipment', 'Day 45', '45 days after trade start'],
  ['Presentation', 'Day 52', '7 days after shipment'],
  ['Acceptance', 'Day 57', '5 days after presentation'],
  ['Supplier payment', 'Day 59', '2 days after acceptance'],
  ['LC maturity', 'Day 405', '360 days after shipment'],
];

export default function ComparePage() {
  return (
    <main className="page page-narrow stack-lg">
      <header className="section-header">
        <div>
          <p className="eyebrow">New scenario</p>
          <h1>Compare quotations</h1>
          <p>Minimal workflow shell. Inputs will be persisted through the new scenario model.</p>
        </div>
        <button className="button" type="button">Run comparison</button>
      </header>

      <section className="card stack">
        <div>
          <h2>1. Transaction</h2>
          <p>Facts unique to this deal.</p>
        </div>
        <div className="form-grid">
          <label className="field"><span>Amount</span><input defaultValue="1000000" inputMode="decimal" /></label>
          <label className="field"><span>Currency</span><select defaultValue="USD"><option>USD</option></select></label>
          <label className="field"><span>Trade start</span><input type="date" defaultValue="2026-07-20" /></label>
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2>2. Financing selection</h2>
          <p>Confirmation and early-payment financing are separate dimensions.</p>
        </div>
        <div className="choice-grid">
          <div className="choice">
            <label><input type="checkbox" /> Confirmation required</label>
            <p>Applies the confirmation fee and exposure period.</p>
          </div>
          <div className="choice">
            <label><input type="checkbox" /> Discounting</label>
            <p>Uses the matching with- or without-confirmation pricing record.</p>
          </div>
          <div className="choice">
            <label><input type="checkbox" /> Forfaiting</label>
            <p>Alternative early-payment financing selection.</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="section-header">
          <div>
            <h2>3. Resolved timeline</h2>
            <p>Business relationships are resolved into Day 0 coordinates.</p>
          </div>
          <button className="button button-secondary" type="button">Edit timing</button>
        </div>
        <ol className="timeline-list">
          {timeline.map(([event, day, relationship]) => (
            <li key={event}><span>{event}</span><strong>{day}</strong><span>{relationship}</span></li>
          ))}
        </ol>
      </section>

      <section className="card stack">
        <div>
          <h2>4. Quotation selection</h2>
          <p>Filter by institution first, then choose human-readable quotation references.</p>
        </div>
        <div className="form-grid">
          <label className="field"><span>Institution</span><select><option>All institutions</option></select></label>
          <label className="field"><span>Quotation</span><select><option>All applicable</option></select></label>
          <label className="field"><span>Version date</span><input type="date" defaultValue="2026-07-20" /></label>
        </div>
        <div className="muted-box">Comparison results will appear here after the application service is connected to Supabase repositories.</div>
      </section>
    </main>
  );
}
