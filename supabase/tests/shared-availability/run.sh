#!/usr/bin/env bash
# Manual check for 00033 against a throwaway local Postgres (never a Supabase
# project). Usage: PGURL=postgres://postgres@localhost:5432/postgres ./run.sh
# setup.sql DROPS the public and auth schemas of that database first.
set -uo pipefail
cd "$(dirname "$0")"
: "${PGURL:?set PGURL to a throwaway local database}"
P="psql $PGURL -q -t -A"
MIG=../../migrations/00033_shared_host_availability.sql
$P -v ON_ERROR_STOP=1 -f setup.sql >/dev/null 2>&1
$P -v ON_ERROR_STOP=1 -f $MIG >/dev/null 2>&1 && $P -v ON_ERROR_STOP=1 -f $MIG >/dev/null 2>&1 || { echo "migration failed"; exit 1; }
reset() { $P -c "truncate bookings, sessions, listings, users cascade" >/dev/null; $P -f data.sql >/dev/null; }
st() { $P -c "select string_agg(right(id::text,2)||'='||status||coalesce('>'||right(held_by_session_id::text,2),''), ' ' order by id) from sessions"; }
confirm() { $P -c "set request.jwt.claim.role='service_role'; select right(confirm_paid_booking('00000000-0000-4000-8000-0000000000$1')::text,2)" 2>&1 | grep -oE "^d[0-9]$|ERROR.*" | tail -1; }
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; pass=$((pass+1)); else echo "FAIL $1: got [$2] want [$3]"; fail=$((fail+1)); fi; }

reset
check "confirm on L1 succeeds" "$(confirm d1)" "d1"
check "holds overlapping L2 and L3, not L2 later, not another host" "$(st)" "c1=open c2=held>c1 c3=held>c1 c4=open c5=open"
check "booking a held session is refused (webhook refunds)" "$(confirm d2)" "ERROR:  session not open"
check "a second guest can still join L1" "$(confirm d3)" "d3"
$P -c "update bookings set status='cancelled' where right(id::text,2)='d1'" >/dev/null
check "one of two bookings cancelled keeps holds" "$(st)" "c1=open c2=held>c1 c3=held>c1 c4=open c5=open"
$P -c "update bookings set status='cancelled' where right(id::text,2)='d3'" >/dev/null
check "last booking cancelled reopens" "$(st)" "c1=open c2=open c3=open c4=open c5=open"

reset; confirm d1 >/dev/null
$P -c "update sessions set status='open', spots_total=6, spots_remaining=6 where right(id::text,2)='c2'" >/dev/null
check "a write of status open cannot unhold" "$($P -c "select status from sessions where right(id::text,2)='c2'")" "held"

# Concurrency: two connections confirm clashing bookings at once, 30 times.
ok=0; dead=0
for i in $(seq 1 30); do
  reset
  confirm d1 > /tmp/sa_a.out & confirm d2 > /tmp/sa_b.out & wait
  grep -qi deadlock /tmp/sa_a.out /tmp/sa_b.out && dead=$((dead+1))
  [ "$($P -c "select count(*) from bookings where status='confirmed'")" = "1" ] && ok=$((ok+1))
done
check "30 concurrent clashing confirmations: exactly one wins each time" "$ok" "30"
check "no deadlocks" "$dead" "0"
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
