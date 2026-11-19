-- Focus sessions pay coins (new enum value in its own migration, committed before use).
alter type public.ledger_kind add value if not exists 'focus';
