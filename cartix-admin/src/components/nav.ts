/** Sidebar structure. Items appear only when the signed-in user has the permission. */
export interface NavItem {
  to: string;
  label: string;
  permission: string;
  end?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { id: 'overview', label: 'Overview', items: [{ to: '/', label: 'Dashboard', permission: 'dashboard.view', end: true }] },
  { id: 'sales', label: 'Sales & Fulfillment', items: [{ to: '/orders', label: 'Orders', permission: 'orders.view' }] },
  {
    id: 'catalog',
    label: 'Catalog Management',
    items: [
      { to: '/products', label: 'Products', permission: 'products.view' },
      { to: '/catalog', label: 'Categories & Brands', permission: 'products.manage' },
      { to: '/inventory', label: 'Inventory', permission: 'products.view' },
      { to: '/attributes', label: 'Attributes', permission: 'products.manage' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers & Marketing',
    items: [
      { to: '/customers', label: 'Customers', permission: 'customers.view' },
      { to: '/coupons', label: 'Coupons & Promotions', permission: 'coupons.manage' },
    ],
  },
  { id: 'business', label: 'Business & Analytics', items: [{ to: '/reports', label: 'Reports & Analytics', permission: 'reports.view' }] },
  {
    id: 'system',
    label: 'System Management',
    items: [
      { to: '/staff', label: 'Staff & Permissions', permission: 'staff.manage' },
      { to: '/shipping', label: 'Shipping & Locations', permission: 'settings.manage' },
      { to: '/activity', label: 'Activity Logs', permission: 'activity.view' },
    ],
  },
];
