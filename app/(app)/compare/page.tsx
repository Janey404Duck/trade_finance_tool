const timeline = [
  ['Trade start / PO', 'Day 0', 'Canonical origin'],
  ['LC issuance', 'Day 35', '10 days before shipment'],
  ['Shipment', 'Day 45', '45 days after trade start'],
  ['Presentation', 'Day 52', '7 days after shipment'],
  ['Acceptance', 'Day 57', '5 days after presentation'],
  ['Supplier payment', 'Day 59', '2 days after acceptance'],
  ['LC maturity', 'Day 405', '360 days after shipment'],
];

const solutions = [
  ['confirmationOnly', 'Confirmation only'],
  ['confirmationWithDiscounting', 'Confirmation + discounting'],
  ['discountingOnly', 'Discounting only'],
  ['forfaitingOnly', 'Forfaiting only'],
  ['confirmationWithForfaiting', 'Confirmation + forfaiting'],
];

export default function ComparePage() {
  return (
    <main className="page page-narrow stack-lg">
      <header className="section-header">
        <div>
          <p className="eyebrow">New scenario</p>
          <h1>Compare quotations</h1>
          <p>One issuing quotation is combined with each selected non-issuing quote and solution.</p>
        </div>
        <button className="button" type="button">Run comparison</button>
      </header>

      <section className="card stack">
        <div><h2>1. Transaction</h2><p>Facts unique to this deal.</p></div>
        <div className="form-grid">
          <label className="field"><span>Amount</span><input defaultValue="1000000" inputMode="decimal" /></label>
          <label className="field"><span>Currency</span><select defaultValue="USD"><option>USD</option><option>CNY</option></select></label>
          <label className="field"><span>Trade start</span><input type="date" defaultValue="2026-07-20" /></label>
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2>2. Issuing bank</h2>
          <p>Select exactly one bank. Its sole applicable quotation and latest active version are resolved automatically.</p>
        </div>
        <label className="field">
          <span>Issuing bank</span>
          <select defaultValue="ziraat"><option value="ziraat">Ziraat Bank</option></select>
        </label>
        <div className="muted-box">The issuing fee applies to every result. Issuing-bank SWIFT applies only in all-fees mode.</div>
      </section>

      <section className="card stack">
        <div><h2>3. Solutions</h2><p>Select one or more fixed solutions to compare.</p></div>
        <div className="choice-grid">
          {solutions.map(([value, label], index) => (
            <div className="choice" key={value}>
              <label>
                <input defaultChecked={index < 2} name="solutions" type="checkbox" value={value} />
                {label}
              </label>
              <p>Only fee records explicitly attached to this solution are used.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2>4. Non-issuing quotations</h2>
          <p>Choose all applicable quotes, all quotes from selected institutions, or specific quotation references.</p>
        </div>
        <div className="choice-grid">
          <div className="choice"><label><input defaultChecked name="nonIssuingSelection" type="radio" value="all" /> All applicable</label></div>
          <div className="choice"><label><input name="nonIssuingSelection" type="radio" value="institutions" /> Selected institutions</label></div>
          <div className="choice"><label><input name="nonIssuingSelection" type="radio" value="quotations" /> Specific quotations</label></div>
        </div>
        <div className="form-grid">
          <label className="field"><span>Institutions</span><select multiple><option>Standard Chartered</option><option>Citi</option></select></label>
          <label className="field"><span>Quotation references</span><select multiple><option>SCB-QT-2026-001</option><option>CITI-QT-2026-003</option></select></label>
          <label className="field"><span>As-of date</span><input type="date" defaultValue="2026-07-20" /></label>
        </div>
      </section>

      <section className="card stack">
        <div><h2>5. Comparison mode</h2><p>Administrative fees are never mixed into core-only results.</p></div>
        <div className="choice-grid">
          <div className="choice">
            <label><input defaultChecked name="comparisonMode" type="radio" value="coreFeesOnly" /> Core fees only</label>
            <p>Issuing fee plus the selected solution&apos;s confirmation, deferred-payment, discounting, or forfaiting fees.</p>
          </div>
          <div className="choice">
            <label><input name="comparisonMode" type="radio" value="allAvailableFees" /> All available fees</label>
            <p>Adds disclosed SWIFT, advising, negotiation, handling, and other administrative fees.</p>
          </div>
        </div>
        <div className="muted-box">Missing expected administrative fees are shown as incomplete disclosures, not zero-cost lines.</div>
      </section>

      <section className="card stack">
        <div className="section-header">
          <div><h2>6. Resolved timeline</h2><p>All quotation calculations share these resolved transaction dates.</p></div>
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
          <h2>7. Results</h2>
          <p>Complete eligible rows rank first, followed by incomplete and ineligible rows.</p>
        </div>
        <div className="muted-box">
          <strong>Shared issuing quotation</strong>
          <p>ZIRAAT-ISS-2026-001 · Version 1 · Issuing fee included in every row</p>
        </div>
        <div className="choice-grid">
          <article className="choice">
            <strong>Confirmation + discounting</strong>
            <p>SCB-QT-2026-001 · Complete</p>
            <p>Issuing cost + non-issuing core/admin cost = total cost</p>
          </article>
          <article className="choice">
            <strong>Confirmation + discounting</strong>
            <p>CITI-QT-2026-003 · Incomplete</p>
            <p>Missing: non-issuing handling fee</p>
          </article>
        </div>
      </section>
    </main>
  );
}
