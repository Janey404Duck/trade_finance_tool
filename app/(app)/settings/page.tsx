const timelineDefaults = [
  ['Shipment', 'Trade start', '+45 calendar days'],
  ['LC issuance', 'Shipment', '−10 calendar days'],
  ['Presentation', 'Shipment', '+7 calendar days'],
  ['Acceptance', 'Presentation', '+5 calendar days'],
  ['Supplier payment', 'Acceptance', '+2 calendar days'],
  ['LC maturity', 'Shipment', '+360 calendar days, following'],
];

const configurationAreas = [
  {
    title: 'Timeline and maturity defaults',
    description: 'Configure maturity anchors, tenor days, business-day handling, and reusable event relationships.',
  },
  {
    title: 'Fee-period conventions',
    description: 'Set suggested start and end events for confirmation, deferred payment, discounting, and forfaiting.',
  },
  {
    title: 'Institution fee schedules',
    description: 'Maintain reusable issuing, confirming, advising, negotiating, and financing-provider charges.',
  },
  {
    title: 'Reference rates',
    description: 'Maintain dated 1M, 3M, 6M, and 12M Term SOFR and SHIBOR values.',
  },
  {
    title: 'Conditional-fee defaults',
    description: 'Choose whether discrepancy and amendment fees start selected for a new comparison.',
  },
  {
    title: 'Access administration',
    description: 'Manage viewer, editor, and administrator access when account administration is connected.',
  },
];

export default function SettingsPage() {
  return (
    <main className="page stack-lg">
      <header className="section-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Settings</h1>
          <p>Reusable defaults and master data. Transaction-specific facts remain on the comparison page.</p>
        </div>
      </header>

      <section className="card stack">
        <div className="section-header">
          <div>
            <h2>Trade templates</h2>
            <p>Defaults are copied into a new scenario and remain overridable for that transaction.</p>
          </div>
          <button className="button" type="button">New template</button>
        </div>

        <div className="section-header">
          <div>
            <h3>Standard USD usance LC</h3>
            <p>Default event relationships</p>
          </div>
          <span className="badge">Active</span>
        </div>

        <div>
          {timelineDefaults.map(([event, anchor, rule]) => (
            <div className="quotation-row" key={event}>
              <strong>{event}</strong>
              <span>Anchor: {anchor}</span>
              <span>{rule}</span>
              <button className="button button-secondary" type="button">Change</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card-grid" aria-label="Other settings">
        {configurationAreas.map((area) => (
          <section className="card" key={area.title}>
            <h2>{area.title}</h2>
            <p>{area.description}</p>
            <button className="button button-secondary" type="button">Configure</button>
          </section>
        ))}
      </section>
    </main>
  );
}
