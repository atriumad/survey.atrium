import { notFound } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";

export default async function ClientUsersPage({ params }: { params: Promise<{ clientId: string }> }) {
  await requireSuperadmin();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();

  const admin = createAdminClient();
  const [clientRes, locationsRes, profilesRes] = await Promise.all([
    admin.from("clients").select("id").eq("id", clientId).maybeSingle(),
    admin.from("locations").select("id, name").eq("client_id", clientId).order("name"),
    admin.from("profiles").select("id, role, location_id").eq("client_id", clientId),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (!clientRes.data) notFound();

  const locations = locationsRes.data ?? [];
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const users = await Promise.all(
    (profilesRes.data ?? []).map(async (p) => {
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add user</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm clientId={clientId} locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <p className="text-sm text-body">No users yet. Create the client&apos;s first admin above.</p>
      ) : (
        users.map((u) => <UserRow key={u.id} user={u} />)
      )}
    </div>
  );
}
