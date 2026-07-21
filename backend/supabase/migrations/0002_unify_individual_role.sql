-- Merge the 'seller' and 'buyer' account types into a single 'individual'
-- role. Which side of a deal someone plays (seller or buyer) is now chosen
-- per-deal at creation time / embedded in the join link, instead of being
-- fixed on the account at signup. Dealer/broker/admin accounts are unaffected.
update users set role = 'individual' where role in ('seller', 'buyer');
alter table users alter column role set default 'individual';
