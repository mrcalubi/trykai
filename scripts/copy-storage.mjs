/**
 * Copies every Storage file from one Supabase project to another.
 *
 * Used for Supabase region moves (OPERATIONS.md, Supabase region move,
 * step 3.10). The database restore brings over `storage.buckets` and the
 * `storage.objects` rows, but those are only metadata: the files live outside
 * Postgres. This walks each bucket on the old project, downloads every file
 * and uploads it to the same bucket and path on the new one with upsert, so
 * the restored rows and the real files line up. A bucket missing on the new
 * project is created with the old one's settings.
 *
 *   node scripts/copy-storage.mjs --dry-run
 *   node scripts/copy-storage.mjs
 *   node scripts/copy-storage.mjs --bucket listing-photos --jobs 8
 *
 * Required (shell only, never committed or pasted in chat):
 *   FROM_SUPABASE_URL                 https://<old ref>.supabase.co
 *   FROM_SUPABASE_SERVICE_ROLE_KEY    old project's service_role (or sb_secret_) key
 *   TO_SUPABASE_URL                   https://<new ref>.supabase.co
 *   TO_SUPABASE_SERVICE_ROLE_KEY      new project's service_role (or sb_secret_) key
 *
 * Safe to run again: every upload overwrites. It only ever reads the old
 * project. Exit code 1 if any file failed; the failures are listed.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const DEFAULT_JOBS = 4
export const MAX_JOBS = 16
export const PAGE_SIZE = 1000
export const ATTEMPTS = 3

const HELP = `Copy every Storage file from one Supabase project to another.

Usage:
  node scripts/copy-storage.mjs [--dry-run] [--bucket <id>]... [--jobs <n>]

Environment:
  FROM_SUPABASE_URL, FROM_SUPABASE_SERVICE_ROLE_KEY   the project to copy from (read only)
  TO_SUPABASE_URL, TO_SUPABASE_SERVICE_ROLE_KEY       the project to copy to

Options:
  --dry-run       list what would be copied (files and size per bucket), change nothing
  --bucket <id>   only this bucket; repeat for more
  --jobs <n>      parallel transfers, 1 to ${MAX_JOBS} (default ${DEFAULT_JOBS})
  --help          show this message
`

export function parseArgs(argv) {
  const options = { dryRun: false, buckets: [], jobs: DEFAULT_JOBS, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--bucket' || arg === '--jobs') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value.`)
      i += 1
      if (arg === '--bucket') options.buckets.push(value)
      else {
        const jobs = Number(value)
        if (!Number.isInteger(jobs) || jobs < 1 || jobs > MAX_JOBS) {
          throw new Error(`--jobs must be a whole number from 1 to ${MAX_JOBS}.`)
        }
        options.jobs = jobs
      }
    } else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

/** Reads and checks the four connection variables. */
export function readConnections(env) {
  const names = [
    'FROM_SUPABASE_URL',
    'FROM_SUPABASE_SERVICE_ROLE_KEY',
    'TO_SUPABASE_URL',
    'TO_SUPABASE_SERVICE_ROLE_KEY',
  ]
  const missing = names.filter((name) => !String(env[name] ?? '').trim())
  if (missing.length) throw new Error(`Set ${missing.join(', ')} in this shell first.`)
  const from = { url: normaliseUrl(env.FROM_SUPABASE_URL), key: env.FROM_SUPABASE_SERVICE_ROLE_KEY.trim() }
  const to = { url: normaliseUrl(env.TO_SUPABASE_URL), key: env.TO_SUPABASE_SERVICE_ROLE_KEY.trim() }
  if (from.url === to.url) throw new Error('FROM_SUPABASE_URL and TO_SUPABASE_URL are the same project.')
  if (from.key === to.key) throw new Error('The two service keys are the same; check TO_SUPABASE_SERVICE_ROLE_KEY.')
  return { from, to }
}

function normaliseUrl(value) {
  const text = String(value).trim().replace(/\/+$/, '')
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error(`Not a URL: ${text}`)
  }
  if (url.protocol !== 'https:') throw new Error(`Use the https project URL, not ${text}`)
  return url.origin
}

/** Which source buckets to copy, and which of them the target lacks. */
export function planBuckets(sourceBuckets, targetBuckets, only = []) {
  const unknown = only.filter((id) => !sourceBuckets.some((bucket) => bucket.id === id))
  if (unknown.length) throw new Error(`No such bucket on the old project: ${unknown.join(', ')}`)
  const copy = sourceBuckets
    .filter((bucket) => !only.length || only.includes(bucket.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const targetIds = new Set(targetBuckets.map((bucket) => bucket.id))
  const create = copy.filter((bucket) => !targetIds.has(bucket.id))
  return { copy, create }
}

/** Seconds for the upload `cacheControl` option, from stored "max-age=N". */
export function cacheSeconds(cacheControl) {
  const match = /max-age=(\d+)/.exec(String(cacheControl ?? ''))
  return match ? match[1] : undefined
}

/**
 * Every file under `prefix` in one bucket. Storage lists one folder level at
 * a time; an entry with no id is a folder.
 */
export async function listFiles(bucketApi, prefix = '') {
  const files = []
  const folders = [prefix]
  while (folders.length) {
    const folder = folders.shift()
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucketApi.list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`Could not list "${folder || '/'}": ${error.message}`)
      for (const entry of data ?? []) {
        const path = folder ? `${folder}/${entry.name}` : entry.name
        if (entry.id == null) folders.push(path)
        else {
          files.push({
            path,
            size: Number(entry.metadata?.size ?? 0),
            contentType: entry.metadata?.mimetype,
            cacheControl: cacheSeconds(entry.metadata?.cacheControl),
          })
        }
      }
      if (!data || data.length < PAGE_SIZE) break
    }
  }
  return files
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

async function withRetry(task, attempts, wait) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await wait(attempt * 500)
    }
  }
  throw lastError
}

async function copyFile(source, target, bucketId, file, wait) {
  await withRetry(
    async () => {
      const { data, error } = await source.storage.from(bucketId).download(file.path)
      if (error) throw new Error(`download: ${error.message}`)
      const { error: uploadError } = await target.storage.from(bucketId).upload(file.path, data, {
        upsert: true,
        contentType: file.contentType || data?.type || undefined,
        cacheControl: file.cacheControl,
      })
      if (uploadError) throw new Error(`upload: ${uploadError.message}`)
    },
    ATTEMPTS,
    wait,
  )
}

async function runPool(items, jobs, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

/**
 * Runs the copy. Returns the exit code. `createClient`, `log` and `wait` are
 * injectable for tests.
 */
export async function runCopy({
  argv = process.argv.slice(2),
  env = process.env,
  makeClient = (url, key) =>
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  log = console.log,
  logError = console.error,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let options
  let connections
  try {
    options = parseArgs(argv)
    if (options.help) {
      log(HELP)
      return 0
    }
    connections = readConnections(env)
  } catch (error) {
    logError(error.message)
    logError('Run with --help for usage.')
    return 1
  }

  const source = makeClient(connections.from.url, connections.from.key)
  const target = makeClient(connections.to.url, connections.to.key)
  log(`From ${connections.from.url}`)
  log(`To   ${connections.to.url}${options.dryRun ? '   (dry run: nothing is changed)' : ''}`)

  let plan
  try {
    const [fromBuckets, toBuckets] = await Promise.all([
      source.storage.listBuckets(),
      target.storage.listBuckets(),
    ])
    if (fromBuckets.error) throw new Error(`old project buckets: ${fromBuckets.error.message}`)
    if (toBuckets.error) throw new Error(`new project buckets: ${toBuckets.error.message}`)
    plan = planBuckets(fromBuckets.data ?? [], toBuckets.data ?? [], options.buckets)
  } catch (error) {
    logError(`Could not read buckets: ${error.message}`)
    return 1
  }

  for (const bucket of plan.create) {
    const settings = {
      public: Boolean(bucket.public),
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
    }
    if (options.dryRun) {
      log(`Would create bucket ${bucket.id} (${settings.public ? 'public' : 'private'})`)
      continue
    }
    const { error } = await target.storage.createBucket(bucket.id, settings)
    if (error) {
      logError(`Could not create bucket ${bucket.id}: ${error.message}`)
      return 1
    }
    log(`Created bucket ${bucket.id} (${settings.public ? 'public' : 'private'})`)
  }

  const failures = []
  let totalFiles = 0
  let totalBytes = 0
  for (const bucket of plan.copy) {
    let files
    try {
      files = await listFiles(source.storage.from(bucket.id))
    } catch (error) {
      logError(`${bucket.id}: ${error.message}`)
      return 1
    }
    const bytes = files.reduce((sum, file) => sum + file.size, 0)
    totalFiles += files.length
    totalBytes += bytes
    log(`${bucket.id}: ${files.length} files, ${formatBytes(bytes)}`)
    if (options.dryRun || !files.length) continue

    let done = 0
    await runPool(files, options.jobs, async (file) => {
      try {
        await copyFile(source, target, bucket.id, file, wait)
      } catch (error) {
        failures.push({ bucket: bucket.id, path: file.path, message: error.message })
      }
      done += 1
      if (done % 100 === 0 || done === files.length) log(`  ${bucket.id}: ${done}/${files.length}`)
    })
  }

  log(`${options.dryRun ? 'Would copy' : 'Copied'} ${totalFiles - failures.length} files, ${formatBytes(totalBytes)} in all.`)
  if (failures.length) {
    logError(`${failures.length} files failed. Run again to retry them:`)
    for (const failure of failures) logError(`  ${failure.bucket}/${failure.path}: ${failure.message}`)
    return 1
  }
  return 0
}

function invokedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  process.exit(await runCopy())
}
