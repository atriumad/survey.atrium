import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { getSiteUrl } from "@/lib/site-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/app/dashboard/(protected)/admin/confirm-submit-button";
import { deleteLocationAction } from "@/app/dashboard/(protected)/admin/actions";
import { CreateLocationForm } from "./create-location-form";
import { EditLocationForm } from "./edit-location-form";
import { LocationQr } from "./location-qr";

export const dynamic = "force-dynamic";

export default async function ClientLocationsPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [clientRes, locationsRes] = await Promise.all([
    admin.from("clients").select("id, slug").eq("id", clientId).maybeSingle(),
    admin
      .from("locations")
      .select("id, name, slug, google_review_url")
      .eq("client_id", clientId)
      .order("name"),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (!clientRes.data) notFound();
  const client = clientRes.data;
  const locations = locationsRes.data ?? [];
  const siteUrl = getSiteUrl();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add location</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateLocationForm clientId={client.id} clientSlug={client.slug} />
        </CardContent>
      </Card>

      {locations.length === 0 ? (
        <p className="text-sm text-body">No locations yet. Add the first one above to get its QR code.</p>
      ) : (
        locations.map((l) => (
          <Card key={l.id} size="sm" className="p-4">
            <CardContent className="p-0 flex items-center gap-4">
              <div className="flex-1 flex flex-col gap-3">
                <p className="font-medium text-ink">{l.name}</p>
                <LocationQr baseUrl={siteUrl} slug={l.slug} name={l.name} />
                <EditLocationForm locationId={l.id} name={l.name} googleReviewUrl={l.google_review_url} />
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
        ))
      )}
    </div>
  );
}
