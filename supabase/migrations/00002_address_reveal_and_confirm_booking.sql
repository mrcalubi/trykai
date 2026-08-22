-- Full address reveal for guests with a confirmed booking (P0.7),
-- and atomic booking confirmation + spots decrement (P0.6).
-- confirm_booking is callable by the owning guest so staging can simulate
-- the payment webhook; revoke authenticated execute once the real webhook lands.

CREATE OR REPLACE FUNCTION public.get_listing_address(listing_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_address text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.sessions s ON s.id = b.session_id
    WHERE b.guest_id = auth.uid()
      AND b.status = 'confirmed'
      AND s.listing_id = get_listing_address.listing_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT l.full_address
  INTO v_address
  FROM public.listings l
  WHERE l.id = get_listing_address.listing_id;

  RETURN v_address;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_address(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_address(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_booking(booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_session public.sessions;
BEGIN
  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = confirm_booking.booking_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found or not pending';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_booking.guest_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions
  WHERE id = v_booking.session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_session.spots_remaining < v_booking.guests_count THEN
    RAISE EXCEPTION 'insufficient spots';
  END IF;

  UPDATE public.sessions
  SET
    spots_remaining = spots_remaining - v_booking.guests_count,
    status = CASE
      WHEN spots_remaining - v_booking.guests_count = 0 THEN 'full'
      ELSE status
    END
  WHERE id = v_session.id;

  UPDATE public.bookings
  SET status = 'confirmed'
  WHERE id = v_booking.id;

  RETURN v_booking.id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_booking(uuid) TO authenticated;
