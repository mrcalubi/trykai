import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import { initSentry } from './lib/sentry'

// Imported first from main.jsx so init runs before the app renders.
initSentry(import.meta.env, {
  useEffect,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
})
