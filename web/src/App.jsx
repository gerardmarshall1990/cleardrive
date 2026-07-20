import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Signup from './pages/Signup';
import MyDeals from './pages/seller/MyDeals';
import NewDeal from './pages/seller/NewDeal';
import DealDetail from './pages/seller/DealDetail';
import BuyerMyDeals from './pages/buyer/MyDeals';
import BuyerDealDetail from './pages/buyer/DealDetail';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDealDetail from './pages/admin/DealDetail';
import MyReferrals from './pages/partner/MyReferrals';
import NewReferral from './pages/partner/NewReferral';
import PartnerDealDetail from './pages/partner/DealDetail';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route
            path="/seller"
            element={
              <ProtectedRoute roles={['seller']}>
                <AppShell>
                  <MyDeals />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/new"
            element={
              <ProtectedRoute roles={['seller']}>
                <AppShell>
                  <NewDeal />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/seller/deals/:id"
            element={
              <ProtectedRoute roles={['seller']}>
                <AppShell>
                  <DealDetail />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/buyer"
            element={
              <ProtectedRoute roles={['buyer']}>
                <AppShell>
                  <BuyerMyDeals />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/buyer/deals/:id"
            element={
              <ProtectedRoute roles={['buyer']}>
                <AppShell>
                  <BuyerDealDetail />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AppShell>
                  <AdminDashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/deals"
            element={
              <ProtectedRoute roles={['admin']}>
                <AppShell>
                  <AdminDashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/deals/:id"
            element={
              <ProtectedRoute roles={['admin']}>
                <AppShell>
                  <AdminDealDetail />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/partner"
            element={
              <ProtectedRoute roles={['dealer', 'broker']}>
                <AppShell>
                  <MyReferrals />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/partner/new"
            element={
              <ProtectedRoute roles={['dealer', 'broker']}>
                <AppShell>
                  <NewReferral />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/partner/deals/:id"
            element={
              <ProtectedRoute roles={['dealer', 'broker']}>
                <AppShell>
                  <PartnerDealDetail />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Welcome />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
