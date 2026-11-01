-- Historical baseline ordering: this file predates the live Supabase migration ledger.
-- The timestamp establishes deterministic replay order; it is not an exact application time.

-- Away Golf Scorer 15.90.3 — Guest Organiser pgcrypto repair
-- Run once in the Supabase SQL Editor if creating an invitation reports:
--   function gen_random_bytes(integer) does not exist

alter function public.create_away_organiser_key(uuid)
  set search_path = public, extensions;

alter function public.create_away_guest_organiser_key(uuid)
  set search_path = public, extensions;

alter function public.claim_away_guest_organiser_access(text, text)
  set search_path = public, extensions;

select 'Guest Organiser invitation repair installed successfully' as result;

