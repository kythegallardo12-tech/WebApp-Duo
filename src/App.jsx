import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import OrdersPage from './pages/OrdersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import useAuth from './store/useAuth';
import useStore from './store/useStore';

function AuthGate() {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const resetWorkspace = useStore((s) => s.resetWorkspace);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === 'signedOut') resetWorkspace();
  }, [status, resetWorkspace]);

  if (status === 'checking') {
    // Under a second for a healthy server: render nothing rather than flashing a loader.
    return <div className="min-h-screen bg-[var(--color-bg-primary)]" aria-busy="true" />;
  }

  if (status === 'offline') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg-primary)]">
        <div className="glass-card p-8 max-w-md text-center" role="alert">
          <WifiOff className="mx-auto text-rose-400 mb-3" size={32} />
          <h1 className="text-lg font-bold text-white">Cannot reach the StockFlow server</h1>
          <p className="text-sm text-slate-400 mt-2">Check that the API is running and your connection is working.</p>
          <button onClick={bootstrap} className="btn-primary mt-5 px-5 py-2.5 text-sm font-semibold">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status !== 'signedIn') return <LoginPage />;

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthGate />
    </BrowserRouter>
  );
}

export default App;
