-- Goals and their steps pay coins (own migration: a new enum value can't be used in the transaction that adds it).
alter type public.ledger_kind add value if not exists 'goal';
