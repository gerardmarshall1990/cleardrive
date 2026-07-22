-- Enforce phone uniqueness at the DB level.
--
-- Every phone-based lookup in the app (resolveBuyerId/resolveSellerId in
-- dealController.js, resolveOwnPartnerId, findMyPartner in
-- partnerController.js) assumes at most one matching row and calls
-- .single()/.maybeSingle() accordingly. Without a unique constraint, two
-- accounts could accidentally (or maliciously) share a phone number, which
-- would either break those lookups (Supabase throws on .single() with >1 row)
-- or silently resolve to the wrong account. Nothing previously enforced this
-- at signup (authController.js) or partner self-registration
-- (partnerController.createPartner), so it was possible today.
--
-- If this migration fails with a uniqueness violation, there is already
-- duplicate phone data in the table — find and resolve those rows manually
-- (e.g. `select phone, count(*) from users group by phone having count(*) > 1
-- and phone is not null`) before re-running.

alter table users add constraint users_phone_unique unique (phone);
alter table partners add constraint partners_phone_unique unique (phone);
