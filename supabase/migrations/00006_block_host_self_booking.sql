-- A host booking their own session moves no real money: the guest charge lands
-- in TryKai's balance and the 24h Transfer sends the host share straight back,
-- so the only movement is Stripe's processing fee out of TryKai. It also takes
-- a spot off the host's own listing.
--
-- create-payment-intent rejects this before charging, but bookings are written
-- with the service role, which bypasses RLS. This trigger is the backstop so a
-- future code path cannot reintroduce it.

create or replace function public.reject_host_self_booking()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_host_id uuid;
begin
  select listings.host_id
  into v_host_id
  from public.sessions
  join public.listings on listings.id = sessions.listing_id
  where sessions.id = new.session_id;

  if v_host_id is not null and v_host_id = new.guest_id then
    raise exception 'a host cannot book their own listing';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_host_self_booking_trigger on public.bookings;
create trigger reject_host_self_booking_trigger
  before insert on public.bookings
  for each row
  execute function public.reject_host_self_booking();
