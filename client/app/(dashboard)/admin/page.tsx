"use client";

import { BarChart3, Building2, Loader2, Package, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getDashboardAnalytics } from "@/api/services/company.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function DashboardView() {
  const [analytics, setAnalytics] = useState<{
    totalCompanies: number;
    totalUsers: number;
    totalDepartments: number;
    stockCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await getDashboardAnalytics();
        setAnalytics(res.data.analytics);
      } catch {
        setAnalytics({
          totalCompanies: 0,
          totalUsers: 0,
          totalDepartments: 0,
          stockCount: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const stats = [
    {
      title: "Total Companies",
      value: analytics?.totalCompanies ?? "-",
      subtitle: "Active organisations",
      icon: Building2,
    },
    {
      title: "Total Users",
      value: analytics?.totalUsers ?? "-",
      subtitle: "Registered users",
      icon: Users,
    },
    {
      title: "Total Departments",
      value: analytics?.totalDepartments ?? "-",
      subtitle: "Across all companies",
      icon: BarChart3,
    },
    {
      title: "Stock Count",
      value: analytics?.stockCount ?? "-",
      subtitle: "Static - live in v2",
      icon: Package,
    },
  ];

  return (
    <div className="space-y-5 p-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of companies, users, and departments.
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading analytics...
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {item.title}
                      </p>
                      <h3 className="mt-2 text-3xl font-semibold">
                        {item.value}
                      </h3>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-muted/40">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl xl:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              Chart placeholder
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start rounded-xl">
              <Link href="/admin/companies">Add Company</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start rounded-xl">
              <Link href="/admin/users">Add User</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start rounded-xl">
              <Link href="/admin/billing">Open Billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function OrgAdminDashboardPage() {
  return <DashboardView />;
}
