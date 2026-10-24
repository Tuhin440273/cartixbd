import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Activity } from './pages/Activity';
import { Attributes } from './pages/Attributes';
import { Catalog } from './pages/Catalog';
import { Coupons } from './pages/Coupons';
import { CustomerDetail, Customers } from './pages/Customers';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Login } from './pages/Login';
import { OrderDetail } from './pages/OrderDetail';
import { Orders } from './pages/Orders';
import { ProductEdit } from './pages/ProductEdit';
import { ProductNew } from './pages/ProductNew';
import { Products } from './pages/Products';
import { Reports } from './pages/Reports';
import { Shipping } from './pages/Shipping';
import { Staff } from './pages/Staff';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-wrap" aria-busy="true" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Hides a page from staff without the permission (the API refuses them as well). */
function Allow({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return <div className="alert" role="alert">You do not have permission to open this page.</div>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Allow permission="dashboard.view"><Dashboard /></Allow>} />
            <Route path="orders" element={<Allow permission="orders.view"><Orders /></Allow>} />
            <Route path="orders/:id" element={<Allow permission="orders.view"><OrderDetail /></Allow>} />
            <Route path="products" element={<Allow permission="products.view"><Products /></Allow>} />
            <Route path="products/new" element={<Allow permission="products.manage"><ProductNew /></Allow>} />
            <Route path="products/:id" element={<Allow permission="products.view"><ProductEdit /></Allow>} />
            <Route path="catalog" element={<Allow permission="products.manage"><Catalog /></Allow>} />
            <Route path="inventory" element={<Allow permission="products.view"><Inventory /></Allow>} />
            <Route path="attributes" element={<Allow permission="products.manage"><Attributes /></Allow>} />
            <Route path="customers" element={<Allow permission="customers.view"><Customers /></Allow>} />
            <Route path="customers/:phone" element={<Allow permission="customers.view"><CustomerDetail /></Allow>} />
            <Route path="coupons" element={<Allow permission="coupons.manage"><Coupons /></Allow>} />
            <Route path="reports" element={<Allow permission="reports.view"><Reports /></Allow>} />
            <Route path="staff" element={<Allow permission="staff.manage"><Staff /></Allow>} />
            <Route path="shipping" element={<Allow permission="settings.manage"><Shipping /></Allow>} />
            <Route path="activity" element={<Allow permission="activity.view"><Activity /></Allow>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
