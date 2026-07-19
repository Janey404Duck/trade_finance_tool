const defaults = [
  ['Shipment', 'Trade start', '+45 calendar days'],
  ['LC issuance', 'Shipment', '−10 calendar days'],
  ['Presentation', 'Shipment', '+7 calendar days'],
  ['Acceptance', 'Presentation', '+5 calendar days'],
  ['Supplier payment', 'Acceptance', '+2 calendar days'],
  ['LC maturity', 'Shipment', '+360 calendar days, following'],
];

export default function TemplatesPage() {
  return (
    <main className="page page-narrow stack-lg">
      <header className="section-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Trade templates</h1>
          <p>Defaults are copied into each scenario and remain overridable transaction by transaction.</p>
        </div>
        <button className="button" type="button">New template</button>
      </header>
      <section className="card stack">
        <div className="section-header">
          <div>
            <h2>Standard USD usance LC</h2>
            <p>Default event relationships</p>
          </div>
          <span className="badge">Active</span>
        </div>
        <div>
          {defaults.map(([event, anchor, rule]) => (
            <div className="quotation-row" key={event}>
              <strong>{event}</strong>
              <span>Anchor: {anchor}</span>
              <span>{rule}</span>
              <button className="button button-secondary" type="button">Change</button>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Pricing-period defaults</h2>
        <p>Confirmation: LC issuance → maturity · Discounting: supplier payment → maturity.</p>
      </section>
    </main>
  );
}
