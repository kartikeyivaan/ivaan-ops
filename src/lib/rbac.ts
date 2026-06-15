export const ROLES = {
  SUPER_ADMIN: "Super Admin",
  SALES_MANAGER: "Sales Manager",
  SALES_EXECUTIVE: "Sales Executive",
  WAREHOUSE: "Warehouse",
  PURCHASE: "Purchase",
  ACCOUNTS: "Accounts",
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
