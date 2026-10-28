import { useEffect, useState } from 'react'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
  ScrollRestoration,
  useMatches,
} from 'react-router-dom'
import { pageTitle } from './lib/pageTitle'
import SiteNav from './components/SiteNav'
import BackButton, { BackSlotProvider } from './components/BackButton'
import Footer from './components/Footer'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import Home from './pages/Home'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ListingDetail from './pages/ListingDetail'
import Profile from './pages/Profile'
import CreateListing from './pages/CreateListing'
import EditListing from './pages/EditListing'
import VerifyIdentity from './pages/VerifyIdentity'
import Dashboard from './pages/Dashboard'
import RedirectToOwnProfile from './pages/RedirectToOwnProfile'
import BookingDetail from './pages/BookingDetail'
import Settings from './pages/Settings'
import Logout from './pages/Logout'
import AdminVerifications from './pages/AdminVerifications'
import AdminListings from './pages/AdminListings'
import AdminSingpassKeys from './pages/AdminSingpassKeys'
import SingpassReturn from './pages/SingpassReturn'
import RefundPolicy from './pages/RefundPolicy'
import CancellationPolicy from './pages/CancellationPolicy'
import DisputePolicy from './pages/DisputePolicy'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

/**
 * Title for routes that name one in their handle. Listing and profile pages
 * have none and set their own from data (usePageTitle); this effect runs after
 * theirs, so it must leave those routes alone.
 */
function useRouteTitle() {
  const matches = useMatches()
  const title = matches[matches.length - 1]?.handle?.title
  useEffect(() => {
    if (typeof title === 'string') document.title = pageTitle(title)
  }, [title])
}

function AppLayout() {
  useRouteTitle()
  return (
    <>
      <ScrollRestoration />
      <SiteNav />
      <BackSlotProvider>
        <BackButton />
        <Outlet />
      </BackSlotProvider>
      <Footer />
    </>
  )
}

function appRoutes() {
  return createRoutesFromElements(
    <Route element={<AppLayout />}>
      <Route path="/" handle={{ title: '' }} element={<Home />} />
      <Route path="/login" handle={{ title: 'Log in' }} element={<Login />} />
      <Route path="/forgot-password" handle={{ title: 'Forgot password' }} element={<ForgotPassword />} />
      <Route path="/reset-password" handle={{ title: 'Reset password' }} element={<ResetPassword />} />
      <Route path="/listings/:id" element={<ListingDetail />} />
      <Route path="/u/:id" element={<Profile />} />
      <Route
        path="/create-listing" handle={{ title: 'Create a listing' }}
        element={
          <RequireAuth>
            <CreateListing />
          </RequireAuth>
        }
      />
      <Route
        path="/verify-identity" handle={{ title: 'Verify your identity' }}
        element={
          <RequireAuth>
            <VerifyIdentity />
          </RequireAuth>
        }
      />
      <Route
        path="/edit-listing/:id" handle={{ title: 'Edit listing' }}
        element={
          <RequireAuth>
            <EditListing />
          </RequireAuth>
        }
      />
      <Route
        path="/bookings/:bookingId" handle={{ title: 'Booking' }}
        element={
          <RequireAuth>
            <BookingDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/bookings" handle={{ title: 'Bookings' }}
        element={
          <RequireAuth>
            <RedirectToOwnProfile tab="bookings" />
          </RequireAuth>
        }
      />
      <Route
        path="/hosting" handle={{ title: 'Hosting' }}
        element={
          <RequireAuth>
            <RedirectToOwnProfile tab="hosting" />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard" handle={{ title: 'Dashboard' }}
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/settings" handle={{ title: 'Edit profile' }}
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route path="/logout" handle={{ title: 'Log out' }} element={<Logout />} />
      <Route
        path="/verify-identity/singpass" handle={{ title: 'Verify with Singpass' }}
        element={
          <RequireAuth>
            <SingpassReturn />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/singpass-keys" handle={{ title: 'Singpass keys' }}
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminSingpassKeys />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/listings" handle={{ title: 'Listing review' }}
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminListings />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/verifications" handle={{ title: 'Verification review' }}
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminVerifications />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="/refund-policy" handle={{ title: 'Refund Policy' }} element={<RefundPolicy />} />
      <Route path="/cancellation-policy" handle={{ title: 'Cancellation Policy' }} element={<CancellationPolicy />} />
      <Route path="/dispute-policy" handle={{ title: 'Dispute Policy' }} element={<DisputePolicy />} />
      <Route path="/terms" handle={{ title: 'Terms of Service' }} element={<Terms />} />
      <Route path="/privacy" handle={{ title: 'Privacy Policy' }} element={<Privacy />} />
      <Route path="/style-guide" handle={{ title: 'Component preview' }} element={<StyleGuide />} />
      <Route path="*" handle={{ title: 'Page not found' }} element={<NotFound />} />
    </Route>,
  )
}

export default function App() {
  const [router] = useState(() => createBrowserRouter(appRoutes()))
  return <RouterProvider router={router} />
}
