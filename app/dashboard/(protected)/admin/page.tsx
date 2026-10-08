import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "../page-header";
import { CreateClientForm } from "./create-client-form";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const admin = createAdminClient();
  const { data: clients, error } = await admin
    .from("clients")
    .select("id, name, slug, locations(count)")
    .order("name");
  if (error) throw error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clients" description="Onboard clients, their locations and their users." />
      <Card>
        <CardHeader>
          <CardTitle>Add client</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateClientForm />
        </CardContent>
      </Card>

      {(clients ?? []).length === 0 ? (
        <p className="text-sm text-body">No clients yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {(clients ?? []).map((c) => (
            <Link key={c.id} href={`/dashboard/admin/${c.id}`}>
              <Card size="sm" className="p-4">
                <CardContent className="p-0 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-sm text-body">{c.slug}</p>
                  </div>
                  <p className="text-sm text-body">{c.locations?.[0]?.count ?? 0} locations</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
