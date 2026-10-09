import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/dashboard/(protected)/page-header";
import { ClientTabs } from "./client-tabs";

export const dynamic = "force-dynamic";

export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [clientRes, locationsRes, usersRes] = await Promise.all([
    admin.from("clients").select("id, name, slug").eq("id", clientId).maybeSingle(),
    admin.from("locations").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("client_id", clientId),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (usersRes.error) throw usersRes.error;
  if (!clientRes.data) notFound();
  const client = clientRes.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={client.name}
        description={`Slug: ${client.slug}`}
        actions={
          <Link href="/dashboard/admin/clients">
            <Button variant="outline" size="sm">All clients</Button>
          </Link>
        }
      />
      <ClientTabs
        clientId={client.id}
        counts={{ locations: locationsRes.count ?? 0, users: usersRes.count ?? 0 }}
      />
      {children}
    </div>
  );
}
