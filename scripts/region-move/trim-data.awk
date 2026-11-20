# Copies a pg_dump data file verbatim, leaving out COPY blocks that have no
# rows, and the supabase_functions.hooks block (a webhook call log). Kept
# lines are printed exactly as read; nothing is retyped.
function is_end(line) { return line == (BS ".") }
BEGIN { BS = sprintf("%c", 92); state = "out" }
{
  if (state == "out") {
    if (index($0, "COPY \"") == 1) {
      pending = $0
      drop_all = (index($0, "COPY \"supabase_functions\".\"hooks\"") == 1)
      state = "first"
      next
    }
    print
    next
  }
  if (state == "first") {
    if (is_end($0)) { state = "out"; next }            # empty block: drop COPY line and marker
    if (drop_all) { state = "skip"; next }             # hooks: drop everything
    print pending; print; state = "in"; next           # real data: keep verbatim
  }
  if (state == "skip") { if (is_end($0)) state = "out"; next }
  if (state == "in") { print; if (is_end($0)) state = "out"; next }
}
