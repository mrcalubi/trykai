import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import RequireAuth from './components/RequireAuth'
import Home from './pages/Home'
import Login from './pages/Login'
import ListingDetail from './pages/ListingDetail'
import CreateListing from './pages/CreateListing'
import EditListing from './pages/EditListing'
import VerifyIdentity from './pages/VerifyIdentity'
import Dashboard from './pages/Dashboard'
import RefundPolicy from './pages/RefundPolicy'
import CancellationPolicy from './pages/CancellationPolicy'
import DisputePolicy from './pages/DisputePolicy'
import StyleGuide from './pages/StyleGuide'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
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
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/dispute-policy" element={<DisputePolicy />} />
        <Route path="/style-guide" element={<StyleGuide />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}
