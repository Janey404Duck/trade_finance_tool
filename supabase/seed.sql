insert into public.institutions (id, name, institution_type, country)
values
  ('10000000-0000-0000-0000-000000000001', 'Standard Chartered', 'bank', 'United Kingdom'),
  ('10000000-0000-0000-0000-000000000002', 'Citi', 'bank', 'United States'),
  ('10000000-0000-0000-0000-000000000003', 'Bank of China', 'bank', 'China'),
  ('10000000-0000-0000-0000-000000000004', 'Ziraat Bank', 'bank', 'Turkey')
on conflict (id) do update set
  name = excluded.name,
  institution_type = excluded.institution_type,
  country = excluded.country,
  active = true;

insert into public.trade_templates (id, name, description)
values (
  '20000000-0000-0000-0000-000000000001',
  'Standard USD usance LC',
  'Reusable event relationships for a 360-day usance LC.'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  active = true;

insert into public.trade_template_events (
  id,
  trade_template_id,
  event_name,
  anchor_event_name,
  offset_days,
  day_type,
  business_day_convention
)
values
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'shipment', 'trade_start', 45, 'calendar', 'none'),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'lc_issuance', 'shipment', -10, 'calendar', 'none'),
  ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'presentation', 'shipment', 7, 'calendar', 'none'),
  ('21000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'acceptance', 'presentation', 5, 'calendar', 'none'),
  ('21000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'supplier_payment', 'acceptance', 2, 'calendar', 'none'),
  ('21000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'lc_maturity', 'shipment', 360, 'calendar', 'following')
on conflict (trade_template_id, event_name) do update set
  anchor_event_name = excluded.anchor_event_name,
  offset_days = excluded.offset_days,
  day_type = excluded.day_type,
  business_day_convention = excluded.business_day_convention;

insert into public.reference_rate_indices (id, name, family, currency, tenor_months)
values
  ('30000000-0000-0000-0000-000000000001', '1M Term SOFR', 'TERM_SOFR', 'USD', 1),
  ('30000000-0000-0000-0000-000000000002', '3M Term SOFR', 'TERM_SOFR', 'USD', 3),
  ('30000000-0000-0000-0000-000000000003', '6M Term SOFR', 'TERM_SOFR', 'USD', 6),
  ('30000000-0000-0000-0000-000000000004', '12M Term SOFR', 'TERM_SOFR', 'USD', 12),
  ('30000000-0000-0000-0000-000000000011', '1M SHIBOR', 'TERM_SHIBOR', 'CNY', 1),
  ('30000000-0000-0000-0000-000000000012', '3M SHIBOR', 'TERM_SHIBOR', 'CNY', 3),
  ('30000000-0000-0000-0000-000000000013', '6M SHIBOR', 'TERM_SHIBOR', 'CNY', 6),
  ('30000000-0000-0000-0000-000000000014', '12M SHIBOR', 'TERM_SHIBOR', 'CNY', 12)
on conflict (family, currency, tenor_months) do update set
  name = excluded.name,
  active = true;

insert into public.reference_rate_values (
  id,
  reference_rate_index_id,
  effective_date,
  rate_pct,
  source
)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date, 4.15, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', current_date, 4.10, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', current_date, 4.00, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', current_date, 3.85, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000011', current_date, 1.55, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000012', current_date, 1.60, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000013', current_date, 1.65, 'Sample seed data'),
  ('31000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000014', current_date, 1.70, 'Sample seed data')
on conflict (reference_rate_index_id, effective_date) do update set
  rate_pct = excluded.rate_pct,
  source = excluded.source;

-- Issuing-bank pricing is its own quotation family and is resolved once per run.
insert into public.issuing_bank_quotations (
  id,
  reference,
  institution_id,
  currency,
  tenor_days,
  notes
)
values (
  '40000000-0000-0000-0000-000000000004',
  'ZIRAAT-ISS-2026-001',
  '10000000-0000-0000-0000-000000000004',
  'USD',
  450,
  'Shared issuing-bank charges for the selected transaction.'
)
on conflict (id) do update set
  reference = excluded.reference,
  institution_id = excluded.institution_id,
  currency = excluded.currency,
  tenor_days = excluded.tenor_days,
  notes = excluded.notes;

insert into public.issuing_bank_quotation_versions (
  id,
  issuing_bank_quotation_id,
  version,
  status,
  valid_from,
  valid_to
)
values (
  '41000000-0000-0000-0000-000000000004',
  '40000000-0000-0000-0000-000000000004',
  1,
  'active',
  '2026-01-01',
  '2026-12-31'
)
on conflict (issuing_bank_quotation_id, version) do update set
  status = excluded.status,
  valid_from = excluded.valid_from,
  valid_to = excluded.valid_to;

insert into public.issuing_bank_fee_records (
  id,
  issuing_bank_quotation_version_id,
  fee_code,
  label,
  component_kind,
  disclosure_status,
  rate_type,
  fixed_amount,
  rate_pct,
  start_event_name,
  end_event_name,
  day_count_convention,
  display_order
)
values
  ('42000000-0000-0000-0000-000000000021', '41000000-0000-0000-0000-000000000004', 'issuing-standard', 'Issuing fee', 'issuing_fee', 'priced', 'annualized_percentage', null, 0.25, 'lc_issuance', 'lc_maturity', 'ACT/360', 10),
  ('42000000-0000-0000-0000-000000000022', '41000000-0000-0000-0000-000000000004', 'issuing-swift', 'Issuing bank SWIFT fee', 'swift_fee', 'priced', 'fixed_amount', 60.00, null, null, null, null, 20)
on conflict (id) do update set
  issuing_bank_quotation_version_id = excluded.issuing_bank_quotation_version_id,
  fee_code = excluded.fee_code,
  label = excluded.label,
  component_kind = excluded.component_kind,
  disclosure_status = excluded.disclosure_status,
  rate_type = excluded.rate_type,
  fixed_amount = excluded.fixed_amount,
  rate_pct = excluded.rate_pct,
  start_event_name = excluded.start_event_name,
  end_event_name = excluded.end_event_name,
  day_count_convention = excluded.day_count_convention,
  display_order = excluded.display_order;

-- SCB and Citi remain completely separate non-issuing-bank quotations.
insert into public.non_issuing_bank_quotations (
  id,
  reference,
  institution_id,
  currency,
  tenor_days
)
values
  ('40000000-0000-0000-0000-000000000001', 'SCB-QT-2026-001', '10000000-0000-0000-0000-000000000001', 'USD', 450),
  ('40000000-0000-0000-0000-000000000002', 'CITI-QT-2026-003', '10000000-0000-0000-0000-000000000002', 'USD', 450)
on conflict (id) do update set
  reference = excluded.reference,
  institution_id = excluded.institution_id,
  currency = excluded.currency,
  tenor_days = excluded.tenor_days;

insert into public.non_issuing_quotation_issuing_banks (
  non_issuing_bank_quotation_id,
  institution_id
)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004')
on conflict (non_issuing_bank_quotation_id, institution_id) do nothing;

insert into public.non_issuing_bank_quotation_versions (
  id,
  non_issuing_bank_quotation_id,
  version,
  status,
  valid_from,
  valid_to
)
values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'active', '2026-01-01', '2026-12-31'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 1, 'active', '2026-01-01', '2026-12-31')
on conflict (non_issuing_bank_quotation_id, version) do update set
  status = excluded.status,
  valid_from = excluded.valid_from,
  valid_to = excluded.valid_to;

insert into public.non_issuing_bank_fee_records (
  id,
  non_issuing_bank_quotation_version_id,
  fee_code,
  label,
  component_kind,
  applicable_solutions,
  disclosure_status,
  rate_type,
  fixed_amount,
  rate_pct,
  reference_rate_family,
  spread_pct,
  start_event_name,
  end_event_name,
  day_count_convention,
  display_order
)
values
  -- SCB core pricing. Confirmed and unconfirmed financing are distinct records.
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'confirmation-standard', 'Confirmation fee', 'confirmation_fee', array['confirmation_only', 'confirmation_with_discounting', 'confirmation_with_forfaiting'], 'priced', 'annualized_percentage', null, 0.90, null, null, 'lc_issuance', 'lc_maturity', 'ACT/360', 10),
  ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', 'discounting-confirmed', 'Discounting with confirmation', 'discounting', array['confirmation_with_discounting'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 0.60, 'supplier_payment', 'lc_maturity', 'ACT/360', 20),
  ('42000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', 'discounting-unconfirmed', 'Discounting without confirmation', 'discounting', array['discounting_only'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 4.00, 'supplier_payment', 'lc_maturity', 'ACT/360', 30),
  ('42000000-0000-0000-0000-000000000009', '41000000-0000-0000-0000-000000000001', 'forfaiting-confirmed', 'Forfaiting with confirmation', 'forfaiting', array['confirmation_with_forfaiting'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 0.70, 'supplier_payment', 'lc_maturity', 'ACT/360', 32),
  ('42000000-0000-0000-0000-000000000010', '41000000-0000-0000-0000-000000000001', 'forfaiting-unconfirmed', 'Forfaiting without confirmation', 'forfaiting', array['forfaiting_only'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 4.10, 'supplier_payment', 'lc_maturity', 'ACT/360', 34),
  -- SCB discloses the complete administrative baseline.
  ('42000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000001', 'advising-standard', 'Advising fee', 'advising_fee', array['confirmation_only', 'confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'priced', 'fixed_amount', 150.00, null, null, null, null, null, null, 40),
  ('42000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000001', 'negotiation-financing', 'Negotiation fee', 'negotiation_fee', array['confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'priced', 'flat_percentage', null, 0.05, null, null, null, null, null, 50),
  ('42000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000001', 'nonissuer-swift', 'Non-issuing bank SWIFT fee', 'swift_fee', array['confirmation_only', 'confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'priced', 'fixed_amount', 75.00, null, null, null, null, null, null, 60),
  ('42000000-0000-0000-0000-000000000007', '41000000-0000-0000-0000-000000000001', 'handling-standard', 'Handling fee', 'handling_fee', array['confirmation_only', 'confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'waived', null, null, null, null, null, null, null, null, 70),
  ('42000000-0000-0000-0000-000000000008', '41000000-0000-0000-0000-000000000001', 'other-courier', 'Courier charge', 'other_administrative_fee', array['confirmation_only'], 'priced', 'fixed_amount', 40.00, null, null, null, null, null, null, 80),
  -- Citi splits confirmation at acceptance and deferred payment through maturity.
  ('42000000-0000-0000-0000-000000000011', '41000000-0000-0000-0000-000000000002', 'confirmation-standard', 'Confirmation until acceptance', 'confirmation_fee', array['confirmation_only', 'confirmation_with_discounting', 'confirmation_with_forfaiting'], 'priced', 'annualized_percentage', null, 1.00, null, null, 'lc_issuance', 'acceptance', 'ACT/360', 10),
  ('42000000-0000-0000-0000-000000000012', '41000000-0000-0000-0000-000000000002', 'deferred-payment-standard', 'Deferred payment fee', 'deferred_payment_fee', array['confirmation_only', 'confirmation_with_discounting', 'confirmation_with_forfaiting'], 'priced', 'annualized_percentage', null, 0.70, null, null, 'acceptance', 'lc_maturity', 'ACT/360', 15),
  ('42000000-0000-0000-0000-000000000013', '41000000-0000-0000-0000-000000000002', 'discounting-confirmed', 'Discounting with confirmation', 'discounting', array['confirmation_with_discounting'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 0.50, 'supplier_payment', 'lc_maturity', 'ACT/360', 20),
  ('42000000-0000-0000-0000-000000000014', '41000000-0000-0000-0000-000000000002', 'discounting-unconfirmed', 'Discounting without confirmation', 'discounting', array['discounting_only'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 3.80, 'supplier_payment', 'lc_maturity', 'ACT/360', 30),
  ('42000000-0000-0000-0000-000000000016', '41000000-0000-0000-0000-000000000002', 'forfaiting-confirmed', 'Forfaiting with confirmation', 'forfaiting', array['confirmation_with_forfaiting'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 0.65, 'supplier_payment', 'lc_maturity', 'ACT/360', 32),
  ('42000000-0000-0000-0000-000000000017', '41000000-0000-0000-0000-000000000002', 'forfaiting-unconfirmed', 'Forfaiting without confirmation', 'forfaiting', array['forfaiting_only'], 'priced', 'reference_plus_spread', null, null, 'TERM_SOFR', 3.95, 'supplier_payment', 'lc_maturity', 'ACT/360', 34),
  ('42000000-0000-0000-0000-000000000015', '41000000-0000-0000-0000-000000000002', 'advising-standard', 'Advising fee', 'advising_fee', array['confirmation_only', 'confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'priced', 'fixed_amount', 175.00, null, null, null, null, null, null, 40),
  ('42000000-0000-0000-0000-000000000018', '41000000-0000-0000-0000-000000000002', 'negotiation-financing', 'Negotiation fee', 'negotiation_fee', array['confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'priced', 'flat_percentage', null, 0.04, null, null, null, null, null, 50),
  ('42000000-0000-0000-0000-000000000019', '41000000-0000-0000-0000-000000000002', 'nonissuer-swift', 'Non-issuing bank SWIFT fee', 'swift_fee', array['confirmation_only', 'confirmation_with_discounting', 'discounting_only', 'forfaiting_only', 'confirmation_with_forfaiting'], 'priced', 'fixed_amount', 65.00, null, null, null, null, null, null, 60)
on conflict (id) do update set
  non_issuing_bank_quotation_version_id = excluded.non_issuing_bank_quotation_version_id,
  fee_code = excluded.fee_code,
  label = excluded.label,
  component_kind = excluded.component_kind,
  applicable_solutions = excluded.applicable_solutions,
  disclosure_status = excluded.disclosure_status,
  rate_type = excluded.rate_type,
  fixed_amount = excluded.fixed_amount,
  rate_pct = excluded.rate_pct,
  reference_rate_family = excluded.reference_rate_family,
  spread_pct = excluded.spread_pct,
  start_event_name = excluded.start_event_name,
  end_event_name = excluded.end_event_name,
  day_count_convention = excluded.day_count_convention,
  display_order = excluded.display_order;
