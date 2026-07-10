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

insert into public.quote_packages (
  id,
  institution_id,
  package_name,
  currency,
  applies_to_all_issuing_banks
)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Natixis USD Package', 'USD', false),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'QNB USD Package', 'USD', false),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'China Trade Solutions USD Package', 'USD', true)
on conflict (id) do nothing;

insert into public.quote_package_issuing_banks (quote_package_id, issuing_bank_id)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005')
on conflict (quote_package_id, issuing_bank_id) do nothing;

insert into public.quote_components (id, quote_package_id, component_type)
values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'CONFIRMATION'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'DEFERRED'),
  ('41000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'DISCOUNTING'),
  ('41000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'FORFAITING'),
  ('41000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', 'CONFIRMATION'),
  ('41000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000002', 'DISCOUNTING'),
  ('41000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000003', 'FORFAITING')
on conflict (id) do nothing;

insert into public.quote_charge_rules (
  id,
  quote_component_id,
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
  ('50000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'CONFIRMATION_FEE', 'applicant', 'annual_pct', 0.80, null, null, 'transaction_amount', 360, 'LC_ISSUE_DAY', 'SHIPMENT_DAY', 10),
  ('50000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'DEFERRED_PAYMENT_FEE', 'applicant', 'annual_pct', 0.80, null, null, 'transaction_amount', 360, 'SHIPMENT_DAY', 'FINAL_MATURITY_DAY', 20),
  ('50000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000003', 'DISCOUNTING_FEE', 'applicant', 'base_plus_spread', null, 'COF', 0.20, 'transaction_amount', 360, 'DISCOUNT_START_DAY', 'FINAL_MATURITY_DAY', 30),
  ('50000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'FORFAITING_FEE', 'applicant', 'annual_pct', 4.00, null, null, 'transaction_amount', 360, 'SHIPMENT_DAY', 'FINAL_MATURITY_DAY', 40),
  ('50000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000005', 'CONFIRMATION_FEE', 'applicant', 'annual_pct', 1.20, null, null, 'transaction_amount', 360, 'LC_ISSUE_DAY', 'FINAL_MATURITY_DAY', 10),
  ('50000000-0000-0000-0000-000000000006', '41000000-0000-0000-0000-000000000006', 'DISCOUNTING_FEE', 'applicant', 'base_plus_spread', null, 'COF', 0.30, 'transaction_amount', 360, 'DISCOUNT_START_DAY', 'FINAL_MATURITY_DAY', 20),
  ('50000000-0000-0000-0000-000000000007', '41000000-0000-0000-0000-000000000007', 'FORFAITING_FEE', 'applicant', 'annual_pct', 4.00, null, null, 'transaction_amount', 360, 'SHIPMENT_DAY', 'FINAL_MATURITY_DAY', 10)
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
  'ISSUING_BANK_FEE',
  'flat_pct',
  2.00,
  'transaction_amount',
  360
)
on conflict (id) do nothing;
