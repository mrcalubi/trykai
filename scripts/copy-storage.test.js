import { describe, expect, it } from 'vitest'
import {
  PAGE_SIZE,
  cacheSeconds,
  formatBytes,
  listFiles,
  parseArgs,
  planBuckets,
  readConnections,
  runCopy,
} from './copy-storage.mjs'

const ENV = {
  FROM_SUPABASE_URL: 'https://oldoldoldoldoldoldol.supabase.co/',
  FROM_SUPABASE_SERVICE_ROLE_KEY: 'old-key',
  TO_SUPABASE_URL: 'https://newnewnewnewnewnewne.supabase.co',
  TO_SUPABASE_SERVICE_ROLE_KEY: 'new-key',
}

/** In-memory Storage with folder-by-folder listing, like the real API. */
function fakeProject({ buckets = [], files = {}, failUpload = () => false } = {}) {
  const state = { buckets: buckets.map((b) => ({ ...b })), files: { ...files }, uploads: [], created: [] }
  const bucketApi = (id) => ({
    async list(folder, { limit, offset }) {
      const prefix = folder ? `${folder}/` : ''
      const names = new Map()
      for (const key of Object.keys(state.files)) {
        const [bucket, ...rest] = key.split('/')
        const path = rest.join('/')
        if (bucket !== id || !path.startsWith(prefix)) continue
        const remainder = path.slice(prefix.length)
        const [head, ...tail] = remainder.split('/')
        if (tail.length) names.set(head, { name: head, id: null, metadata: null })
        else {
          const file = state.files[key]
          names.set(head, {
            name: head,
            id: `id-${key}`,
            metadata: { size: file.body.length, mimetype: file.type, cacheControl: 'max-age=3600' },
          })
        }
      }
      const sorted = [...names.values()].sort((a, b) => a.name.localeCompare(b.name))
      return { data: sorted.slice(offset, offset + limit), error: null }
    },
    async download(path) {
      const file = state.files[`${id}/${path}`]
      if (!file) return { data: null, error: { message: 'not found' } }
      return { data: new Blob([file.body], { type: file.type }), error: null }
    },
    async upload(path, blob, options) {
      if (failUpload(`${id}/${path}`)) return { error: { message: 'boom' } }
      state.uploads.push({ key: `${id}/${path}`, options, size: blob.size })
      state.files[`${id}/${path}`] = { body: await blob.text(), type: options.contentType }
      return { error: null }
    },
  })
  const client = {
    storage: {
      async listBuckets() {
        return { data: state.buckets, error: null }
      },
      async createBucket(id, settings) {
        state.created.push({ id, settings })
        state.buckets.push({ id, public: settings.public })
        return { error: null }
      },
      from: bucketApi,
    },
  }
  return { client, state }
}

function run({ source, target, argv = [], env = ENV }) {
  const out = []
  const err = []
  return runCopy({
    argv,
    env,
    makeClient: (url) => (url.includes('old') ? source.client : target.client),
    log: (line) => out.push(line),
    logError: (line) => err.push(line),
    wait: async () => {},
  }).then((code) => ({ code, out: out.join('\n'), err: err.join('\n') }))
}

describe('parseArgs', () => {
  it('reads flags', () => {
    expect(parseArgs(['--dry-run', '--bucket', 'a', '--bucket', 'b', '--jobs', '8'])).toEqual({
      dryRun: true,
      buckets: ['a', 'b'],
      jobs: 8,
      help: false,
    })
  })

  it('rejects bad input', () => {
    expect(() => parseArgs(['--jobs', '0'])).toThrow('--jobs')
    expect(() => parseArgs(['--jobs', '99'])).toThrow('--jobs')
    expect(() => parseArgs(['--bucket'])).toThrow('needs a value')
    expect(() => parseArgs(['--bucket', '--dry-run'])).toThrow('needs a value')
    expect(() => parseArgs(['--force'])).toThrow('Unknown option')
  })
})

describe('readConnections', () => {
  it('normalises the URLs', () => {
    expect(readConnections(ENV)).toEqual({
      from: { url: 'https://oldoldoldoldoldoldol.supabase.co', key: 'old-key' },
      to: { url: 'https://newnewnewnewnewnewne.supabase.co', key: 'new-key' },
    })
  })

  it('names every missing variable', () => {
    expect(() => readConnections({ FROM_SUPABASE_URL: 'https://a.supabase.co' })).toThrow(
      'FROM_SUPABASE_SERVICE_ROLE_KEY, TO_SUPABASE_URL, TO_SUPABASE_SERVICE_ROLE_KEY',
    )
  })

  it('refuses the same project twice, http, and junk', () => {
    expect(() => readConnections({ ...ENV, TO_SUPABASE_URL: ENV.FROM_SUPABASE_URL })).toThrow('same project')
    expect(() => readConnections({ ...ENV, TO_SUPABASE_SERVICE_ROLE_KEY: 'old-key' })).toThrow('same')
    expect(() => readConnections({ ...ENV, TO_SUPABASE_URL: 'http://x.supabase.co' })).toThrow('https')
    expect(() => readConnections({ ...ENV, TO_SUPABASE_URL: 'not a url' })).toThrow('Not a URL')
  })
})

describe('planBuckets', () => {
  const source = [{ id: 'b' }, { id: 'a' }, { id: 'c' }]

  it('copies all, sorted, and creates the missing ones', () => {
    const plan = planBuckets(source, [{ id: 'a' }])
    expect(plan.copy.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(plan.create.map((b) => b.id)).toEqual(['b', 'c'])
  })

  it('limits to --bucket and rejects unknown names', () => {
    expect(planBuckets(source, [], ['c']).copy.map((b) => b.id)).toEqual(['c'])
    expect(() => planBuckets(source, [], ['zzz'])).toThrow('zzz')
  })
})

describe('helpers', () => {
  it('cacheSeconds', () => {
    expect(cacheSeconds('max-age=3600')).toBe('3600')
    expect(cacheSeconds('public, max-age=60')).toBe('60')
    expect(cacheSeconds(undefined)).toBeUndefined()
  })

  it('formatBytes', () => {
    expect(formatBytes(12)).toBe('12 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('listFiles', () => {
  it('walks nested folders', async () => {
    const { client } = fakeProject({
      files: {
        'p/top.jpg': { body: 'x', type: 'image/jpeg' },
        'p/u1/a.jpg': { body: 'xx', type: 'image/jpeg' },
        'p/u1/deep/b.png': { body: 'xxx', type: 'image/png' },
        'q/other.jpg': { body: 'x', type: 'image/jpeg' },
      },
    })
    const files = await listFiles(client.storage.from('p'))
    expect(files.map((f) => f.path).sort()).toEqual(['top.jpg', 'u1/a.jpg', 'u1/deep/b.png'])
    expect(files.find((f) => f.path === 'u1/deep/b.png')).toMatchObject({
      size: 3,
      contentType: 'image/png',
      cacheControl: '3600',
    })
  })

  it('pages through a full folder', async () => {
    const files = {}
    for (let i = 0; i < PAGE_SIZE + 5; i += 1) files[`p/f${String(i).padStart(5, '0')}`] = { body: 'x', type: 't' }
    const { client } = fakeProject({ files })
    expect(await listFiles(client.storage.from('p'))).toHaveLength(PAGE_SIZE + 5)
  })

  it('reports a listing error', async () => {
    const api = { list: async () => ({ data: null, error: { message: 'denied' } }) }
    await expect(listFiles(api)).rejects.toThrow('denied')
  })
})

describe('runCopy', () => {
  const sourceSetup = () =>
    fakeProject({
      buckets: [
        { id: 'listing-photos', public: true },
        { id: 'verification-docs', public: false, file_size_limit: 1000, allowed_mime_types: ['image/png'] },
      ],
      files: {
        'listing-photos/u1/a.jpg': { body: 'aaaa', type: 'image/jpeg' },
        'listing-photos/u2/b.jpg': { body: 'bb', type: 'image/jpeg' },
        'verification-docs/u1/id.png': { body: 'ccc', type: 'image/png' },
      },
    })

  it('dry run lists sizes and changes nothing', async () => {
    const source = sourceSetup()
    const target = fakeProject({ buckets: [{ id: 'listing-photos', public: true }] })
    const { code, out } = await run({ source, target, argv: ['--dry-run'] })
    expect(code).toBe(0)
    expect(out).toContain('Would create bucket verification-docs (private)')
    expect(out).toContain('listing-photos: 2 files, 6 B')
    expect(out).toContain('Would copy 3 files')
    expect(target.state.uploads).toEqual([])
    expect(target.state.created).toEqual([])
  })

  it('creates missing buckets and copies every file with upsert', async () => {
    const source = sourceSetup()
    const target = fakeProject({ buckets: [{ id: 'listing-photos', public: true }] })
    const { code, out } = await run({ source, target, argv: ['--jobs', '2'] })
    expect(code).toBe(0)
    expect(target.state.created).toEqual([
      {
        id: 'verification-docs',
        settings: { public: false, fileSizeLimit: 1000, allowedMimeTypes: ['image/png'] },
      },
    ])
    expect(target.state.uploads.map((u) => u.key).sort()).toEqual([
      'listing-photos/u1/a.jpg',
      'listing-photos/u2/b.jpg',
      'verification-docs/u1/id.png',
    ])
    expect(target.state.uploads[0].options).toMatchObject({ upsert: true, cacheControl: '3600' })
    expect(target.state.files['listing-photos/u1/a.jpg']).toEqual({ body: 'aaaa', type: 'image/jpeg' })
    expect(out).toContain('Copied 3 files')
    expect(source.state.uploads).toEqual([])
  })

  it('copies only the named bucket', async () => {
    const source = sourceSetup()
    const target = fakeProject({ buckets: [{ id: 'listing-photos' }, { id: 'verification-docs' }] })
    await run({ source, target, argv: ['--bucket', 'verification-docs'] })
    expect(target.state.uploads.map((u) => u.key)).toEqual(['verification-docs/u1/id.png'])
  })

  it('retries, then lists what failed and exits 1', async () => {
    const source = sourceSetup()
    let tries = 0
    const target = fakeProject({
      buckets: [{ id: 'listing-photos' }, { id: 'verification-docs' }],
      failUpload: (key) => {
        if (key === 'listing-photos/u2/b.jpg') return true
        if (key === 'listing-photos/u1/a.jpg') return (tries += 1) < 2
        return false
      },
    })
    const { code, err, out } = await run({ source, target })
    expect(code).toBe(1)
    expect(err).toContain('1 files failed')
    expect(err).toContain('listing-photos/u2/b.jpg: upload: boom')
    expect(target.state.files['listing-photos/u1/a.jpg']).toBeDefined()
    expect(out).toContain('Copied 2 files')
  })

  it('stops on bad settings before touching anything', async () => {
    const source = sourceSetup()
    const target = fakeProject()
    const { code, err } = await run({ source, target, env: { ...ENV, TO_SUPABASE_URL: ENV.FROM_SUPABASE_URL } })
    expect(code).toBe(1)
    expect(err).toContain('same project')
  })

  it('stops when the buckets cannot be read', async () => {
    const source = sourceSetup()
    const target = fakeProject()
    target.client.storage.listBuckets = async () => ({ data: null, error: { message: 'Invalid JWT' } })
    const { code, err } = await run({ source, target })
    expect(code).toBe(1)
    expect(err).toContain('new project buckets: Invalid JWT')
  })
})
