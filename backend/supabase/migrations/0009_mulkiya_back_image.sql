-- Adds a column to persist the BACK side of the seller's Mulkiya (vehicle
-- registration card) photo. Previously only the front side was collected —
-- the front has the fields Claude Vision extracts (plate, VIN, make, model,
-- year, colour), but sellers must now also upload the back for a complete
-- document record admin can review.
--
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

alter table deals add column if not exists mulkiya_back_image_url text;
