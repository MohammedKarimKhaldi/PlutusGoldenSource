alter table public.fundraising_clients
  add column retainer_amount_minor bigint,
  add column retainer_currency char(3),
  add check (retainer_amount_minor is null or retainer_amount_minor > 0),
  add check (retainer_currency is null or retainer_currency ~ '^[A-Z]{3}$'),
  add check (
    (retainer_amount_minor is null and retainer_currency is null)
    or (retainer_amount_minor is not null and retainer_currency is not null)
  );
