import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteClientForm } from "@/app/dashboard/(protected)/admin/clients/delete-client-form";
import { LogoCard } from "./logo-card";
import { RenameClientForm } from "./rename-client-form";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const { data: client, error } = await admin.from("clients").select("id, name, slug, logo_url").eq("id", clientId).maybeSingle();
  if (error) throw error;
  if (!client) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Client details</CardTitle>
        </CardHeader>
        <CardContent>
          <RenameClientForm clientId={client.id} name={client.name} slug={client.slug} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <LogoCard clientId={client.id} logoUrl={client.logo_url} clientName={client.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delete client</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteClientForm clientId={client.id} slug={client.slug} />
        </CardContent>
      </Card>
    </div>
  );
}
