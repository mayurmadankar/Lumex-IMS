import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BillingView() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Monitor plan status, invoices, and billing controls.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">Enterprise</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Active across all enabled companies
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Billing Email</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">admin@example.com</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Primary billing contact
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">$1,240</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Due within 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Recent Billing Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-175 text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 font-medium">Date</th>
                  <th className="py-3 font-medium">Reference</th>
                  <th className="py-3 font-medium">Amount</th>
                  <th className="py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["16 Mar 2026", "INV-1001", "$420", "Paid"],
                  ["10 Mar 2026", "INV-0998", "$820", "Pending"],
                  ["02 Mar 2026", "INV-0991", "$1,100", "Paid"],
                ].map((row, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-4">{row[0]}</td>
                    <td className="py-4">{row[1]}</td>
                    <td className="py-4">{row[2]}</td>
                    <td className="py-4">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}