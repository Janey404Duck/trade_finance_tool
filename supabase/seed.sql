insert into public.institutions (id, name, institution_type, country)
values
  ('10000000-0000-0000-0000-000000000001', 'Natixis', 'bank', 'France'),
  ('10000000-0000-0000-0000-000000000002', 'QNB', 'bank', 'Qatar'),
  ('10000000-0000-0000-0000-000000000003', 'Habib Bank', 'bank', 'Pakistan'),
  ('10000000-0000-0000-0000-000000000004', 'China Trade Solutions', 'trading_house', 'China')
on conflict (id) do nothing;

insert into public.issuing_banks (id, name, country)
values
  ('20000000-0000-0000-0000-000000000001', 'Ziraat Bank', 'Turkey'),
  ('20000000-0000-0000-0000-000000000002', 'Halkbank', 'Turkey'),
  ('20000000-0000-0000-0000-000000000003', 'VakifBank', 'Turkey'),
  ('20000000-0000-0000-0000-000000000004', 'Garanti BBVA', 'Turkey'),
  ('20000000-0000-0000-0000-000000000005', 'Isbank', 'Turkey')
on conflict (id) do nothing;

insert into public.reference_rates (id, rate_key, currency, tenor_days, rate_pct, rate_date, source)
values
  ('30000000-0000-0000-0000-000000000001', 'COF', 'USD', 360, 4.20, current_date, 'Seed'),
  ('30000000-0000-0000-0000-000000000002', 'TERM_SOFR', 'USD', 360, 4.50, current_date, 'Seed'),
  ('30000000-0000-0000-0000-000000000003', 'TERM_SHIBOR', 'RMB', 360, 2.30, current_date, 'Seed')
on conflict (rate_key, currency, tenor_days, rate_date) do nothing;

insert into public.quotes (
  id,
  institution_id,
  quote_name,
  currency,
  financing_type,
  requires_confirmation,
  applies_to_all_issuing_banks
)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Natixis USD Discounting', 'USD', 'discounting', true, false),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'QNB Whole-Period Confirmation', 'USD', 'mixed', true, false),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'China Trade Solutions Forfaiting', 'USD', 'forfaiting', false, true)
on conflict (id) do nothing;

insert into public.quote_issuing_banks (quote_id, issuing_bank_id)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005')
on conflict (quote_id, issuing_bank_id) do nothing;

insert into public.quote_charge_rules (
  id,
  quote_id,
  charge_type,
  payer,
  rate_type,
  fixed_rate_pct,
  base_rate_key,
  spread_pct,
  amount_basis,
  day_count_basis,
  start_anchor,
  end_anchor,
  display_order
)
values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'confirmation', 'applicant', 'annual_pct', 0.80, null, null, 'transaction_amount', 360, 'LC_ISSUE_DAY', 'SHIPMENT_DAY', 10),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'deferred', 'applicant', 'annual_pct', 0.80, null, null, 'transaction_amount', 360, 'SHIPMENT_DAY', 'FINAL_MATURITY_DAY', 20),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'discounting', 'applicant', 'base_plus_spread', null, 'COF', 0.20, 'transaction_amount', 360, 'SUPPLIER_PAYMENT_DAY', 'FINAL_MATURITY_DAY', 30),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'confirmation', 'applicant', 'annual_pct', 1.20, null, null, 'transaction_amount', 360, 'LC_ISSUE_DAY', 'FINAL_MATURITY_DAY', 10),
  ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', 'forfaiting', 'applicant', 'annual_pct', 4.00, null, null, 'transaction_amount', 360, 'SHIPMENT_DAY', 'FINAL_MATURITY_DAY', 10)
on conflict (id) do nothing;

insert into public.issuing_bank_fee_rules (
  id,
  issuing_bank_id,
  currency,
  fee_name,
  charge_type,
  rate_type,
  fixed_rate_pct,
  amount_basis,
  day_count_basis
)
values (
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'USD',
  'Opening Fee',
  'issuing_fee',
  'flat_pct',
  2.00,
  'transaction_amount',
  360
)
on conflict (id) do nothing;
