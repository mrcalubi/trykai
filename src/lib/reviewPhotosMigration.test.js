import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00047_review_photos.sql'),
  'utf8',
)
const grants14 = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/00014_display_name.sql'),
  'utf8',
)

const HOST_GRANT =
  /revoke all on function public\.reviews_for_host\(uuid\) from public;\s*grant execute on function public\.reviews_for_host\(uuid\) to anon, authenticated/
const LISTING_GRANT =
  /revoke all on function public\.reviews_for_listing\(uuid\) from public;\s*grant execute on function public\.reviews_for_listing\(uuid\) to anon, authenticated/

describe('00047 review photos', () => {
  it('stores up to 3 object paths, not URLs', () => {
    expect(migration).toMatch(/add column if not exists photo_paths text\[] not null default '\{\}'/)
    expect(migration).toMatch(/cardinality\(photo_paths\) <= 3/)
    expect(migration).not.toMatch(/photo_urls/)
  })

  it('rejects a path outside the reviewer folder, a URL, or a missing object', () => {
    expect(migration).toMatch(/security definer/)
    expect(migration).toMatch(/set search_path = public/)
    expect(migration).toMatch(
      /\(\s*'\^' \|\| new\.reviewer_id::text \|\| '\/\[A-Za-z0-9\._-\]\+\$'\s*\)/,
    )
    expect(migration).toMatch(/from storage\.objects/)
    expect(migration).toMatch(/bucket_id = 'review-photos'/)
    expect(migration).toMatch(/name = photo_path/)
    expect(migration).toMatch(/before insert or update on public\.reviews/)
    expect(migration).toMatch(
      /tg_op = 'UPDATE' and new\.photo_paths is not distinct from old\.photo_paths then\s*return new;/,
    )
  })

  it('creates a public jpeg/webp bucket capped at 3 MB with insert-only own-folder policy', () => {
    expect(migration).toMatch(/values \(\s*'review-photos',\s*'review-photos',\s*true,\s*3145728,/)
    expect(migration).toMatch(/array\['image\/jpeg', 'image\/webp'\]/)
    expect(migration).toMatch(
      /create policy review_photos_insert_own_folder on storage\.objects[\s\S]*for insert/,
    )
    expect(migration).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/)
    expect(migration).not.toMatch(/review_photos_update/)
    expect(migration).not.toMatch(/review_photos_delete/)
    expect(migration).not.toMatch(/review_photos_select/)
    expect(migration).not.toMatch(/for update[\s\S]*review-photos/)
    expect(migration).not.toMatch(/for delete[\s\S]*review-photos/)
    expect(migration).not.toMatch(/for select[\s\S]*review-photos/)
  })

  it('redefines the read RPCs with photo_paths and restores the 00014 grants', () => {
    expect(migration).toMatch(/drop function if exists public\.reviews_for_listing\(uuid\)/)
    expect(migration).toMatch(/drop function if exists public\.reviews_for_host\(uuid\)/)
    expect(migration).toMatch(
      /create function public\.reviews_for_host\(p_host_id uuid\)[\s\S]*photo_paths text\[]/,
    )
    expect(migration).toMatch(
      /create function public\.reviews_for_listing\(p_listing_id uuid\)[\s\S]*photo_paths text\[]/,
    )
    expect(migration).toMatch(/r\.photo_paths/)
    expect(grants14).toMatch(HOST_GRANT)
    expect(grants14).toMatch(LISTING_GRANT)
    expect(migration.match(HOST_GRANT)[0]).toBe(grants14.match(HOST_GRANT)[0])
    expect(migration.match(LISTING_GRANT)[0]).toBe(grants14.match(LISTING_GRANT)[0])
  })
})
