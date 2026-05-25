import {
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  List,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminModuleKey = "dashboard" | "companies" | "users" | "items" | "billing";
export type UserModuleKey = "dashboard" | "clipboard";

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
  { key: "items", title: "Item List", icon: List, href: "/admin/item-list" },
  { key: "billing", title: "Billing", icon: CreditCard, href: "/admin/billing" },
];

export const USER_MODULES: SidebarModuleItem[] = [
  { key: "dashboard", title: "Dashboard", icon: LayoutDashboard, href: "/user" },
  { key: "clipboard", title: "Clipboard", icon: ClipboardList, href: "/user/clipboard" },
];

