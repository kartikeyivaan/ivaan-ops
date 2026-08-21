export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  SALES_MANAGER: "Sales Manager",
  SALES_EXECUTIVE: "Sales Executive",
  PROJECTS_MANAGER: "Projects Manager",
  PROJECTS_SALES_EXECUTIVE: "Projects Sales Executive",
  WAREHOUSE: "Warehouse",
  PURCHASE: "Purchase",
  ACCOUNTS: "Accounts",
  SERVICE_EXECUTIVE: "Service Executive",
  DOCUMENTATION_EXECUTIVE: "Documentation Executive",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleName[] = Object.values(ROLES);

export type NavItem = {
  label: string;
  href: string;
  roles: RoleName[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", roles: ALL_ROLES },
  { label: "Help & Learning", href: "/help", roles: ALL_ROLES },
  {
    label: "Approvals",
    href: "/approvals",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.PROJECTS_MANAGER,
      ROLES.PURCHASE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Customers",
    href: "/sales/customers",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Quotations",
    href: "/sales/quotations",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Proforma Invoices",
    href: "/sales/proforma-invoices",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Projects",
    href: "/projects/proposals",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.PROJECTS_MANAGER,
      ROLES.PROJECTS_SALES_EXECUTIVE,
    ],
  },
  {
    label: "Project Enquiries",
    href: "/projects/enquiries",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.PROJECTS_MANAGER,
      ROLES.PROJECTS_SALES_EXECUTIVE,
    ],
  },
  {
    label: "Service",
    href: "/service",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.PROJECTS_MANAGER,
      ROLES.PROJECTS_SALES_EXECUTIVE,
      ROLES.SERVICE_EXECUTIVE,
    ],
  },
  {
    label: "Inventory",
    href: "/inventory",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Manual Stock Entry",
    href: "/inventory/manual-stock",
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    label: "Inventory Audit",
    href: "/inventory/audits",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.SALES_MANAGER,
    ],
  },
  {
    label: "QR History",
    href: "/inventory/qr-history",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.DOCUMENTATION_EXECUTIVE,
    ],
  },
  {
    label: "Product In / Out",
    href: "/inventory/product-movements",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Stock Timeline",
    href: "/sales/inventory-timeline",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
    ],
  },
  {
    label: "Purchase",
    href: "/purchase",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.PURCHASE,
      ROLES.WAREHOUSE,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.PROJECTS_MANAGER,
      ROLES.PROJECTS_SALES_EXECUTIVE,
    ],
  },
  {
    label: "Safety Stock",
    href: "/inventory/safety-stock",
    roles: [ROLES.SUPER_ADMIN, ROLES.PURCHASE, ROLES.SALES_MANAGER],
  },
  {
    label: "Dispatch",
    href: "/inventory/dispatches",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Products",
    href: "/masters/products",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Banking",
    href: "/banking",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Daily Receipts",
    href: "/sales/daily-receipts",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS, ROLES.SALES_EXECUTIVE],
  },
  {
    label: "PI Payments",
    href: "/accounts/payments",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Invoice Queue",
    href: "/accounts/invoice-queue",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Stock Transfers",
    href: "/accounts/stock-transfers",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Documentation",
    href: "/documentation",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ACCOUNTS,
      ROLES.DOCUMENTATION_EXECUTIVE,
    ],
  },
  {
    label: "Users",
    href: "/admin/users",
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    label: "Companies",
    href: "/admin/companies",
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    label: "Warehouses",
    href: "/admin/warehouses",
    roles: [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER],
  },
  {
    label: "Sales Targets",
    href: "/admin/sales-targets",
    roles: [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER],
  },
  {
    label: "Audit Logs",
    href: "/admin/audit",
    roles: [ROLES.SUPER_ADMIN],
  },
];

export function hasRole(userRoles: string[], allowed: RoleName[]): boolean {
  return userRoles.some((role) => allowed.includes(role as RoleName));
}

export function canAccessNav(userRoles: string[], item: NavItem): boolean {
  return hasRole(userRoles, item.roles);
}

export function isSuperAdmin(userRoles: string[]): boolean {
  return userRoles.includes(ROLES.SUPER_ADMIN);
}
