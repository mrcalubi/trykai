import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SiteNav from './components/SiteNav'
import BackButton, { BackSlotProvider } from './components/BackButton'
import ScrollToTop from './components/ScrollToTop'
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
import AdminVerifications from './pages/AdminVerifications'
import AdminSingpassKeys from './pages/AdminSingpassKeys'
import SingpassReturn from './pages/SingpassReturn'
import RefundPolicy from './pages/RefundPolicy'
import CancellationPolicy from './pages/CancellationPolicy'
import DisputePolicy from './pages/DisputePolicy'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import StyleGuide from './pages/StyleGuide'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <SiteNav />
      <BackSlotProvider>
        <BackButton />
        <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/u/:id" element={<Profile />} />
        <Route
          path="/create-listing"
          element={
            <RequireAuth>
              <CreateListing />
            </RequireAuth>
          }
        />
        <Route
          path="/verify-identity"
          element={
            <RequireAuth>
              <VerifyIdentity />
            </RequireAuth>
          }
        />
        <Route
          path="/edit-listing/:id"
          element={
            <RequireAuth>
              <EditListing />
            </RequireAuth>
          }
        />
        <Route
          path="/bookings/:bookingId"
          element={
            <RequireAuth>
              <BookingDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/bookings"
          element={
            <RequireAuth>
              <RedirectToOwnProfile tab="bookings" />
            </RequireAuth>
          }
        />
        <Route
          path="/hosting"
          element={
            <RequireAuth>
              <RedirectToOwnProfile tab="hosting" />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/verify-identity/singpass"
          element={
            <RequireAuth>
              <SingpassReturn />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/singpass-keys"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminSingpassKeys />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/verifications"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminVerifications />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/dispute-policy" element={<DisputePolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/style-guide" element={<StyleGuide />} />
        <Route path="*" element={<NotFound />} />
        </Routes>
      </BackSlotProvider>
      <Footer />
    </BrowserRouter>
  )
}
