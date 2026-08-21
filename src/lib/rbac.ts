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

export const NAV_GROUPS = [
  "Overview",
  "Sales",
  "Projects",
  "Inventory",
  "Purchase",
  "Reports",
  "Accounts",
  "Admin",
] as const;

export type NavGroup = (typeof NAV_GROUPS)[number];

export type NavItem = {
  label: string;
  href: string;
  group: NavGroup;
  roles: RoleName[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", group: "Overview", roles: ALL_ROLES },
  { label: "Help & Learning", href: "/help", group: "Overview", roles: ALL_ROLES },
  {
    label: "Approvals",
    href: "/approvals",
    group: "Overview",
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
    group: "Sales",
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
    group: "Sales",
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
    group: "Sales",
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
    group: "Projects",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.PROJECTS_MANAGER,
      ROLES.PROJECTS_SALES_EXECUTIVE,
    ],
  },
  {
    label: "Project Enquiries",
    href: "/projects/enquiries",
    group: "Projects",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.PROJECTS_MANAGER,
      ROLES.PROJECTS_SALES_EXECUTIVE,
    ],
  },
  {
    label: "Service",
    href: "/service",
    group: "Projects",
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
    group: "Inventory",
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
    group: "Inventory",
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    label: "Inventory Audit",
    href: "/inventory/audits",
    group: "Inventory",
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
    group: "Inventory",
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
    group: "Inventory",
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
    group: "Inventory",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.PURCHASE,
    ],
  },
  {
    label: "Safety Stock",
    href: "/inventory/safety-stock",
    group: "Inventory",
    roles: [ROLES.SUPER_ADMIN, ROLES.PURCHASE, ROLES.SALES_MANAGER],
  },
  {
    label: "Dispatch",
    href: "/inventory/dispatches",
    group: "Inventory",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.SALES_MANAGER,
      ROLES.SALES_EXECUTIVE,
      ROLES.WAREHOUSE,
      ROLES.ACCOUNTS,
    ],
  },
  {
    label: "Purchase",
    href: "/purchase",
    group: "Purchase",
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
    label: "Reports",
    href: "/reports",
    group: "Reports",
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
    group: "Reports",
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
    group: "Accounts",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Daily Receipts",
    href: "/sales/daily-receipts",
    group: "Accounts",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS, ROLES.SALES_EXECUTIVE],
  },
  {
    label: "PI Payments",
    href: "/accounts/payments",
    group: "Accounts",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Invoice Queue",
    href: "/accounts/invoice-queue",
    group: "Accounts",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Stock Transfers",
    href: "/accounts/stock-transfers",
    group: "Accounts",
    roles: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTS],
  },
  {
    label: "Documentation",
    href: "/documentation",
    group: "Accounts",
    roles: [
      ROLES.SUPER_ADMIN,
      ROLES.ACCOUNTS,
      ROLES.DOCUMENTATION_EXECUTIVE,
    ],
  },
  {
    label: "Users",
    href: "/admin/users",
    group: "Admin",
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    label: "Companies",
    href: "/admin/companies",
    group: "Admin",
    roles: [ROLES.SUPER_ADMIN],
  },
  {
    label: "Warehouses",
    href: "/admin/warehouses",
    group: "Admin",
    roles: [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER],
  },
  {
    label: "Sales Targets",
    href: "/admin/sales-targets",
    group: "Admin",
    roles: [ROLES.SUPER_ADMIN, ROLES.SALES_MANAGER],
  },
  {
    label: "Audit Logs",
    href: "/admin/audit",
    group: "Admin",
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
