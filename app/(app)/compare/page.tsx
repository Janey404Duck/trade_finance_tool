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
          <h2>2. Comparison cases</h2>
          <p>Select any cases to compare. Every case uses the same transaction and timeline.</p>
        </div>
        <div className="choice-grid">
          <div className="choice">
            <label><input defaultChecked name="comparisonCases" type="checkbox" value="confirmation" /> Confirmation only</label>
            <p>One result containing all applicable confirmation-period fees.</p>
          </div>
          <div className="choice">
            <label><input defaultChecked name="comparisonCases" type="checkbox" value="confirmation-discounting" /> Confirmation + discounting</label>
            <p>Both components are calculated together in one transaction result.</p>
          </div>
          <div className="choice">
            <label><input name="comparisonCases" type="checkbox" value="discounting" /> Discounting only</label>
            <p>Uses only a rate explicitly quoted for the unconfirmed case.</p>
          </div>
          <div className="choice">
            <label><input name="comparisonCases" type="checkbox" value="forfaiting" /> Forfaiting</label>
            <p>Compared as an alternative early-payment case.</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2>3. Fee comparison</h2>
          <p>Choose the comparison basis, then include conditional events if relevant.</p>
        </div>
        <div className="choice-grid">
          <div className="choice">
            <label><input defaultChecked name="comparisonMode" type="radio" value="coreFeesOnly" /> Core fees only</label>
            <p>Issuing, confirmation, deferred-payment, discounting, and forfaiting fees only.</p>
          </div>
          <div className="choice">
            <label><input name="comparisonMode" type="radio" value="allAvailableFees" /> All available fees</label>
            <p>Adds disclosed administrative fees and flags incomplete fee coverage.</p>
          </div>
        </div>
        <div className="choice-grid">
          <div className="choice">
            <label>
              <input name="includedConditionalFeeKinds" type="checkbox" value="discrepancyFee" />
              Include discrepancy fee
            </label>
            <p>Includes a disclosed discrepancy charge; missing disclosure is shown as incomplete.</p>
          </div>
          <div className="choice">
            <label>
              <input name="includedConditionalFeeKinds" type="checkbox" value="amendmentFee" />
              Include amendment fee
            </label>
            <p>Applies issuing- or confirming-bank amendment fees only to relevant cases.</p>
          </div>
        </div>
        <div className="muted-box">Negotiation, SWIFT, advising, handling, amendment, and discrepancy are administrative fees. “Not provided” is never treated as zero; waived and not applicable must be stated explicitly.</div>
      </section>

      <section className="card stack">
        <div className="section-header">
          <div>
            <h2>4. Resolved timeline</h2>
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
          <h2>5. Quotation selection</h2>
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
