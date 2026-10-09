"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/superadmin";
import { generatePassword } from "@/lib/passwords";
import { describeDbError } from "@/lib/db-errors";
import type { ActionResult } from "@/lib/action-result";
import {
  adminLocationFormSchema,
  clientDeleteSchema,
  clientFormSchema,
  clientUpdateSchema,
  locationUpdateSchema,
  userFormSchema,
  userIdSchema,
} from "@/lib/validation";

const ADMIN_PATH = "/dashboard/admin";

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export async function createClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = clientFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid client.");

  const admin = createAdminClient();
  const { error } = await admin.from("clients").insert(parsed.data);
  if (error) return fail(describeDbError(error, "Could not create client."));

  revalidatePath(`${ADMIN_PATH}/clients`);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: null };
}

export async function createLocationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = adminLocationFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    googleReviewUrl: formData.get("googleReviewUrl") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid location.");

  const { clientId, name, slug, googleReviewUrl } = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.from("locations").insert({
    client_id: clientId,
    name,
    slug,
    google_review_url: googleReviewUrl,
  });
  if (error) return fail(describeDbError(error, "Could not create location."));

  revalidatePath(`${ADMIN_PATH}/clients/${clientId}`, "layout");
  return { ok: true, data: null };
}

export async function createUserAction(
  _prev: ActionResult<{ email: string; password: string }> | null,
  formData: FormData
): Promise<ActionResult<{ email: string; password: string }>> {
  await requireSuperadmin();
  const parsed = userFormSchema.safeParse({
    clientId: formData.get("clientId"),
    email: formData.get("email"),
    role: formData.get("role"),
    locationId: formData.get("locationId") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid user.");

  const { clientId, email, role, locationId } = parsed.data;
  const admin = createAdminClient();

  if (role === "manager") {
    const { data: location } = await admin
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!location) return fail("Location does not belong to this client.");
  }

  const password = generatePassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created.user) return fail(authError?.message ?? "Could not create user.");

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    client_id: clientId,
    role,
    location_id: role === "manager" ? locationId : null,
  });
  if (profileError) {
    // Do not leave a login that has no profile.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error("createUserAction: rollback deleteUser failed", cleanupError.message);
      return fail(
        `${describeDbError(profileError, "Could not create user.")} A login for ${email} may need manual cleanup.`
      );
    }
    return fail(describeDbError(profileError, "Could not create user."));
  }

  revalidatePath(`${ADMIN_PATH}/clients/${clientId}`, "layout");
  return { ok: true, data: { email, password } };
}

async function findTenantUserRole(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  // Superadmin accounts are never managed from the panel.
  if (!data || data.role === "superadmin") return null;
  return data.role as string;
}

export async function resetPasswordAction(
  _prev: ActionResult<{ password: string }> | null,
  formData: FormData
): Promise<ActionResult<{ password: string }>> {
  await requireSuperadmin();
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return fail("Invalid user.");

  const admin = createAdminClient();
  if (!(await findTenantUserRole(admin, parsed.data.userId))) return fail("User not found.");

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password });
  if (error) return fail("Could not reset password.");

  return { ok: true, data: { password } };
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  await requireSuperadmin();
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) throw new Error("Invalid user.");

  const admin = createAdminClient();
  if (!(await findTenantUserRole(admin, parsed.data.userId))) throw new Error("User not found.");

  // profiles.id references auth.users on delete cascade.
  const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
  if (error) throw new Error("Could not delete user.");
  revalidatePath(ADMIN_PATH, "layout");
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  await requireSuperadmin();
  const locationId = String(formData.get("locationId") ?? "");
  if (!userIdSchema.safeParse({ userId: locationId }).success) throw new Error("Invalid location.");

  const admin = createAdminClient();
  const { error } = await admin.from("locations").delete().eq("id", locationId);
  if (error) throw new Error("Could not delete location.");
  revalidatePath(ADMIN_PATH, "layout");
}

export async function updateClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = clientUpdateSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid client.");

  const { clientId, name, slug } = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.from("clients").update({ name, slug }).eq("id", clientId);
  if (error) return fail(describeDbError(error, "Could not update client."));

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true, data: null };
}

export async function updateLocationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = locationUpdateSchema.safeParse({
    locationId: formData.get("locationId"),
    name: formData.get("name"),
    googleReviewUrl: formData.get("googleReviewUrl") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid location.");

  const { locationId, name, googleReviewUrl } = parsed.data;
  const admin = createAdminClient();
  const { data: location } = await admin.from("locations").select("client_id").eq("id", locationId).maybeSingle();
  if (!location) return fail("Location not found.");

  // The slug is deliberately not updatable: printed QR codes point at it.
  const { error } = await admin
    .from("locations")
    .update({ name, google_review_url: googleReviewUrl })
    .eq("id", locationId);
  if (error) return fail(describeDbError(error, "Could not update location."));

  revalidatePath(`${ADMIN_PATH}/clients/${location.client_id}`, "layout");
  return { ok: true, data: null };
}

export async function deleteClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();
  const parsed = clientDeleteSchema.safeParse({
    clientId: formData.get("clientId"),
    confirmSlug: formData.get("confirmSlug") ?? "",
  });
  if (!parsed.success) return fail("Invalid request.");

  const { clientId, confirmSlug } = parsed.data;
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("slug").eq("id", clientId).maybeSingle();
  if (!client) return fail("Client not found.");
  if (confirmSlug !== client.slug) return fail("Type the client slug exactly to confirm.");

  // Remove the logins first: deleting the client row would orphan them.
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("client_id", clientId);
  if (profilesError) return fail("Could not read the client's users.");

  for (const profile of profiles ?? []) {
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) {
      console.error("deleteClientAction: could not delete user", profile.id, error.message);
      return fail("Some of the client's logins may already have been removed. The client was not deleted. Try again.");
    }
  }

  const { error: deleteError } = await admin.from("clients").delete().eq("id", clientId);
  if (deleteError) return fail(describeDbError(deleteError, "Could not delete client. Its logins may already have been removed; try again."));

  revalidatePath(ADMIN_PATH, "layout");
  redirect(`${ADMIN_PATH}/clients`);
}
