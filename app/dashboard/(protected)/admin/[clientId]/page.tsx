import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { getSiteUrl } from "@/lib/site-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { PageHeader } from "../../page-header";
import { deleteLocationAction } from "../actions";
import { CreateLocationForm } from "./create-location-form";
import { CreateUserForm } from "./create-user-form";
import { LocationQr } from "./location-qr";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";

export default async function AdminClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [
    { data: client, error: clientError },
    { data: locations, error: locationsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    admin.from("clients").select("id, name, slug").eq("id", clientId).maybeSingle(),
    admin.from("locations").select("id, name, slug, google_review_url").eq("client_id", clientId).order("name"),
    admin.from("profiles").select("id, role, location_id").eq("client_id", clientId),
  ]);
  if (clientError) throw clientError;
  if (locationsError) throw locationsError;
  if (profilesError) throw profilesError;
  if (!client) notFound();

  const siteUrl = getSiteUrl();
  const locationNames = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const users = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data, error } = await admin.auth.admin.getUserById(p.id);
      if (error) throw error;
      return {
        id: p.id,
        role: p.role as string,
        email: data.user?.email ?? "(unknown)",
        locationName: p.location_id ? (locationNames.get(p.location_id) ?? null) : null,
      };
    })
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={client.name}
        description={`Slug: ${client.slug}`}
        actions={
          <Link href="/dashboard/admin">
            <Button variant="outline" size="sm">All clients</Button>
          </Link>
        }
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Locations</h2>
        <Card>
          <CardHeader>
            <CardTitle>Add location</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateLocationForm clientId={client.id} clientSlug={client.slug} />
          </CardContent>
        </Card>
        {(locations ?? []).map((l) => (
          <Card key={l.id} size="sm" className="p-4">
            <CardContent className="p-0 flex items-center gap-4">
              <div className="flex-1 flex flex-col gap-3">
                <p className="font-medium text-ink">{l.name}</p>
                <LocationQr baseUrl={siteUrl} slug={l.slug} name={l.name} />
              </div>
              <form action={deleteLocationAction}>
                <input type="hidden" name="locationId" value={l.id} />
                <ConfirmSubmitButton
                  confirmMessage={`Delete location "${l.name}"? This also deletes all of its reviews and scans. This cannot be undone.`}
                  ariaLabel={`Delete ${l.name}`}
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-body">Users</h2>
        <Card>
          <CardHeader>
            <CardTitle>Add user</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateUserForm
              clientId={client.id}
              locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
            />
          </CardContent>
        </Card>
        {users.map((u) => (
          <UserRow key={u.id} user={u} />
        ))}
      </section>
    </div>
  );
}
