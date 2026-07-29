import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
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

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/create-listing" element={<CreateListing />} />
        <Route path="/verify-identity" element={<VerifyIdentity />} />
        <Route path="/edit-listing/:id" element={<EditListing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/dispute-policy" element={<DisputePolicy />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  )
}
