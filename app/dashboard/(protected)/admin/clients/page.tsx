import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { loadClientsIndex } from "@/lib/dashboard-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../../page-header";
import { CreateClientForm } from "./create-client-form";
import { DeleteClientForm } from "./delete-client-form";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSuperadmin();
  const { q } = await searchParams;
  const admin = createAdminClient();
  const all = await loadClientsIndex(admin);
  const term = (q ?? "").trim().toLowerCase();
  const clients = term
    ? all.filter((c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term))
    : all;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clients" description="Open a client to manage its locations, users and data." />

      <Card>
        <CardHeader>
          <CardTitle>Add client</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateClientForm />
        </CardContent>
      </Card>

      <form className="flex items-center gap-2" role="search">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search by name or slug" className="w-64" />
        <Button type="submit" variant="outline" size="sm">Search</Button>
      </form>

      {clients.length === 0 ? (
        <p className="text-sm text-body">{term ? "No clients match that search." : "No clients yet."}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.map((c) => (
            <Card key={c.id} size="sm" className="p-4">
              <CardContent className="p-0 flex items-start justify-between gap-4">
                <Link href={`/dashboard/admin/clients/${c.id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-sm text-body">{c.slug}</p>
                </Link>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-sm text-body text-right">
                    {c.locationsCount} locations · {c.usersCount} users
                    <br />
                    {c.lastReviewAt ? `Last review ${new Date(c.lastReviewAt).toLocaleDateString()}` : "No reviews yet"}
                  </p>
                  <details className="text-sm w-full max-w-md">
                    <summary
                      aria-label={`Delete ${c.name}`}
                      className="cursor-pointer text-right text-body hover:text-ink"
                    >
                      Delete
                    </summary>
                    <div className="mt-3">
                      <DeleteClientForm clientId={c.id} slug={c.slug} />
                    </div>
                  </details>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
