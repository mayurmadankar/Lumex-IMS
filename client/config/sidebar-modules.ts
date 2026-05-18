import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminModuleKey = "dashboard" | "companies" | "users" | "billing";
export type UserModuleKey = "dashboard";

export type SidebarModuleItem = {
  key: AdminModuleKey | UserModuleKey;
  title: string;
  icon: LucideIcon;
  href: string;
};

export const ORG_ADMIN_MODULES: SidebarModuleItem[] = [
  { key: "dashboard", title: "Dashboard", icon: LayoutDashboard, href: "/admin" },
  { key: "companies", title: "Companies", icon: Building2, href: "/admin/companies" },
  { key: "users", title: "Users", icon: Users, href: "/admin/users" },
  { key: "billing", title: "Billing", icon: CreditCard, href: "/admin/billing" },
];

export const USER_MODULES: SidebarModuleItem[] = [
  { key: "dashboard", title: "Dashboard", icon: LayoutDashboard, href: "/user" },
];

