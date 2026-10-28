import { execFileSync } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// vercel.json rewrites only the app's real routes to index.html. Any other
// URL gets Vercel's 404.html with a real 404 status, so that file is the app
// too: it boots, and the router shows NotFound.
function notFoundPage() {
  return {
    name: 'not-found-page',
    apply: 'build',
    async writeBundle({ dir }) {
      await copyFile(join(dir, 'index.html'), join(dir, '404.html'))
    },
  }
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), 'VITE_')
  const releaseFromEnv = process.env.VITE_SENTRY_RELEASE || fileEnv.VITE_SENTRY_RELEASE
  const sentryRelease = releaseFromEnv || process.env.VERCEL_GIT_COMMIT_SHA || gitHead()
  // Only fill the process env when nothing else named a release. Vite lets
  // process.env override .env, so writing it unconditionally would hide a
  // release set only in .env.
  if (sentryRelease && !releaseFromEnv) process.env.VITE_SENTRY_RELEASE = sentryRelease

  const sentryOrg = process.env.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
  const uploadSourcemaps = command === 'build'
    && Boolean(sentryOrg && sentryProject && sentryAuthToken)

  return {
    build: {
      // Hidden maps are uploaded, then deleted, so they are not deployed.
      sourcemap: uploadSourcemaps ? 'hidden' : false,
    },
    plugins: [
      react(),
      notFoundPage(),
      uploadSourcemaps && sentryVitePlugin({
        org: sentryOrg,
        project: sentryProject,
        authToken: sentryAuthToken,
        telemetry: false,
        release: {
          name: sentryRelease,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
      }),
    ].filter(Boolean),
  }
})
