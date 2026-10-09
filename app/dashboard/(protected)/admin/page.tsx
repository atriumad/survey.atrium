import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadAgencyOverview } from "@/lib/dashboard-data";
import { Card, CardContent } from "@/components/ui/card";
import { RatingEmoji } from "@/components/ui/rating-emoji";
import { PageHeader } from "../page-header";

export const dynamic = "force-dynamic";

export default async function AgencyOverviewPage() {
  await requireSuperadmin();
  const admin = createAdminClient();
  const { totals, recentClients } = await loadAgencyOverview(admin);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="All clients at a glance." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Clients" value={totals.clients} />
        <Stat label="Locations" value={totals.locations} />
        <Stat label="Reviews (30 days)" value={totals.reviews30d} />
        <Stat
          label="Average (30 days)"
          value={totals.reviews30d > 0 ? totals.average30d.toFixed(1) : "—"}
          extra={totals.reviews30d > 0 ? <RatingEmoji rating={totals.average30d} size="sm" /> : null}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Recent activity by client</h2>
        {recentClients.length === 0 ? (
          <p className="text-sm text-body">
            No clients yet. <Link className="underline" href="/dashboard/admin/clients">Add the first client</Link>.
          </p>
        ) : (
          recentClients.map((c) => (
            <Link key={c.id} href={`/dashboard/admin/clients/${c.id}`}>
              <Card size="sm" className="p-4">
                <CardContent className="p-0 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-body">{c.slug}</p>
                  </div>
                  <p className="text-sm text-body">
                    {c.lastReviewAt ? `Last review ${new Date(c.lastReviewAt).toLocaleDateString()}` : "No reviews yet"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, extra }: { label: string; value: string | number; extra?: React.ReactNode }) {
  return (
    <Card size="sm" className="p-4">
      <CardContent className="p-0 flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-body">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-3xl font-semibold text-ink">{value}</p>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}
