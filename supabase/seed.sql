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
on conflict (id) do update set name = excluded.name, description = excluded.description, active = true;

insert into public.trade_template_events (
  id, trade_template_id, event_name, anchor_event_name, offset_days, day_type,
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

insert into public.reference_rate_indices (
  id, name, family, currency, tenor_months
)
values
  ('30000000-0000-0000-0000-000000000001', '1M Term SOFR', 'TERM_SOFR', 'USD', 1),
  ('30000000-0000-0000-0000-000000000002', '3M Term SOFR', 'TERM_SOFR', 'USD', 3),
  ('30000000-0000-0000-0000-000000000003', '6M Term SOFR', 'TERM_SOFR', 'USD', 6),
  ('30000000-0000-0000-0000-000000000004', '12M Term SOFR', 'TERM_SOFR', 'USD', 12),
  ('30000000-0000-0000-0000-000000000011', '1M SHIBOR', 'TERM_SHIBOR', 'CNY', 1),
  ('30000000-0000-0000-0000-000000000012', '3M SHIBOR', 'TERM_SHIBOR', 'CNY', 3),
  ('30000000-0000-0000-0000-000000000013', '6M SHIBOR', 'TERM_SHIBOR', 'CNY', 6),
  ('30000000-0000-0000-0000-000000000014', '12M SHIBOR', 'TERM_SHIBOR', 'CNY', 12)
on conflict (family, currency, tenor_months) do update set name = excluded.name, active = true;

insert into public.reference_rate_values (
  id, reference_rate_index_id, effective_date, rate_pct, source
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

insert into public.quotations (
  id, reference, institution_id, currency, product_type, tenor_days
)
values
  ('40000000-0000-0000-0000-000000000001', 'SCB-QT-2026-001', '10000000-0000-0000-0000-000000000001', 'USD', 'lc_financing', 450),
  ('40000000-0000-0000-0000-000000000002', 'CITI-QT-2026-003', '10000000-0000-0000-0000-000000000002', 'USD', 'lc_financing', 450)
on conflict (id) do update set
  reference = excluded.reference,
  institution_id = excluded.institution_id,
  currency = excluded.currency,
  tenor_days = excluded.tenor_days;

insert into public.quotation_issuing_institutions (quotation_id, institution_id)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004')
on conflict (quotation_id, institution_id) do nothing;

insert into public.quotation_versions (
  id, quotation_id, version, status, valid_from, valid_to
)
values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'active', '2026-01-01', '2026-12-31'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 1, 'active', '2026-01-01', '2026-12-31')
on conflict (quotation_id, version) do update set
  status = excluded.status,
  valid_from = excluded.valid_from,
  valid_to = excluded.valid_to;

insert into public.pricing_records (
  id, quotation_version_id, label, component_kind, pricing_condition, rate_type,
  rate_pct, reference_rate_family, spread_pct, start_event_name, end_event_name,
  day_count_convention, display_order
)
values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Confirmation fee', 'confirmation_fee', 'confirmation_required', 'annualized_percentage', 0.90, null, null, 'lc_issuance', 'lc_maturity', 'ACT/360', 10),
  ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', 'Discounting with confirmation', 'discounting', 'confirmation_required', 'reference_plus_spread', null, 'TERM_SOFR', 0.60, 'supplier_payment', 'lc_maturity', 'ACT/360', 20),
  ('42000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', 'Discounting without confirmation', 'discounting', 'confirmation_not_required', 'reference_plus_spread', null, 'TERM_SOFR', 4.00, 'supplier_payment', 'lc_maturity', 'ACT/360', 30),
  ('42000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000002', 'Confirmation fee', 'confirmation_fee', 'confirmation_required', 'annualized_percentage', 1.00, null, null, 'lc_issuance', 'lc_maturity', 'ACT/360', 10),
  ('42000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000002', 'Discounting with confirmation', 'discounting', 'confirmation_required', 'reference_plus_spread', null, 'TERM_SOFR', 0.50, 'supplier_payment', 'lc_maturity', 'ACT/360', 20),
  ('42000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000002', 'Discounting without confirmation', 'discounting', 'confirmation_not_required', 'reference_plus_spread', null, 'TERM_SOFR', 3.80, 'supplier_payment', 'lc_maturity', 'ACT/360', 30)
on conflict (id) do update set
  label = excluded.label,
  pricing_condition = excluded.pricing_condition,
  rate_type = excluded.rate_type,
  rate_pct = excluded.rate_pct,
  reference_rate_family = excluded.reference_rate_family,
  spread_pct = excluded.spread_pct,
  start_event_name = excluded.start_event_name,
  end_event_name = excluded.end_event_name,
  day_count_convention = excluded.day_count_convention;
