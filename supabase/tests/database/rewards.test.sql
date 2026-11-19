-- One-time 200-coin rewards and push subscriptions.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'rw@example.com'),
  ('a2222222-2222-2222-2222-222222222222', 'rw2@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111"}', true);

select results_eq($$ select coins, balance from public.claim_reward('home_screen') $$, $$ values (200, 300::bigint) $$, 'home screen pays 200');
select results_eq($$ select coins, balance from public.claim_reward('home_screen') $$, $$ values (0, 300::bigint) $$, 'only once');
select throws_ok($$ select * from public.claim_reward('notifications') $$, '22023', 'no_subscription', 'notifications need a saved subscription');
select lives_ok($$ select public.save_push_subscription('https://push.example.com/abc', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'Test phone') $$, 'save a subscription');
select results_eq($$ select coins from public.claim_reward('notifications') $$, $$ values (200) $$, 'notifications pay 200');
select is((select count(*)::int from public.user_rewards), 2, 'both rewards recorded');
select throws_ok($$ select endpoint from public.push_subscriptions $$, '42501', null, 'the app cannot read push endpoints or keys');
select throws_ok($$ insert into public.user_rewards (user_id, reward, coins) values (auth.uid(), 'home_screen', 9999) $$, '42501', null, 'no direct writes');
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.user_rewards), 0, 'others see nothing');

select * from finish();
rollback;
