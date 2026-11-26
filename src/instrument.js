import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import { initSentry } from './lib/sentry'
import { initAnalytics } from './lib/analytics'

// Imported first from main.jsx so init runs before the app renders.
initSentry(import.meta.env, {
  useEffect,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
})

// Cookieless PostHog, loaded in the background. Off without VITE_POSTHOG_KEY.
initAnalytics(import.meta.env)
