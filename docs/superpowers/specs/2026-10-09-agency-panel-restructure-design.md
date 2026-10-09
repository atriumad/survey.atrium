# Agency panel restructure (delivery 1 of 2)

Date: 2026-10-09
Status: draft, pending user review
Builds on: `2026-10-08-multi-tenant-admin-design.md` (superadmin role, service-role actions)

## Problem

The superadmin panel is two pages: a clients list, and one long `/dashboard/admin/[clientId]`
page that stacks locations, QR codes, user creation and user rows. It is hard to scan,
shows nothing about how a client is performing, and offers no way to edit a client's data.

## Goal

Atrium staff can open each client as its own workspace with separate sections
(summary, locations, users, reviews, settings), see that client's data read-only, and
manage the client's data. Delivery 2 (separate spec) adds system alerts and an
activity log on top of this structure.

## Decisions (agreed with user)

- Internal "requests" mean **alerts and system activity**, not a ticket inbox.
- Approach A for delivery 2: derived alerts + a persisted `activity_log` of panel actions.
  Delivery 1 only reserves the navigation slot; no alerts or activity are built here.
- Delivery 1 is the navigation restructure and the per-client workspace.

## Non-goals (delivery 1)

- Alerts, `activity_log`, and the Activity page (delivery 2).
- CSV export from the agency side, impersonating a client user, editing reviews.
- Editing a location's slug (printed QR codes depend on it; it stays immutable).
- Managing a client's negative keywords (clients keep doing that in their Settings).
- Any change to what tenant admins and managers can do or see.

## Information architecture

Sidebar for `superadmin`: **Overview**, **Clients**.

| Route | Content |
|---|---|
| `/dashboard/admin` | Overview: totals across all clients (clients, locations, reviews last 30 days, average rating) and a short list of clients ordered by most recent review. Placeholder card "Alerts and activity" is NOT rendered until delivery 2. |
| `/dashboard/admin/clients` | Clients list with search, per client: locations count, users count, last review date. "Add client" form lives here. |
| `/dashboard/admin/clients/[clientId]` | **Summary**: the same metric cards, rating distribution and last-24h reviews a client sees, scoped to this client, with the existing location filter. |
| `/dashboard/admin/clients/[clientId]/locations` | Locations: create, edit (name, Google review link), delete, QR + download. |
| `/dashboard/admin/clients/[clientId]/users` | Users: create (admin/manager), reset password, delete. |
| `/dashboard/admin/clients/[clientId]/reviews` | Read-only paged reviews table with location/classification/date filters. No export. |
| `/dashboard/admin/clients/[clientId]/settings` | Rename client (name, slug) and delete client (type the slug to confirm). |

The old route `/dashboard/admin/[clientId]` is removed (never deployed; no redirect).
A shared `clients/[clientId]/layout.tsx` renders the client header (name, slug) and a tab
bar (client component using `usePathname`) with counts on Locations and Users.

## Shared data layer

To avoid duplicating the tenant dashboard queries, the loading logic moves into functions
that take the Supabase client and a `clientId` as arguments:

- `lib/dashboard-data.ts`
  - `loadOverviewData(supabase, { clientId, locationId })` returns
    `{ summary, scansTotal, conversionRate, ratingTier, trend, recentReviews }`
    (exactly what `app/dashboard/(protected)/page.tsx` computes today).
  - `loadReviewsPage(supabase, { clientId, locationId, classification, from, to, page, pageSize })`
    returns `{ reviews, totalPages }`.
- Presentational parts of the overview (`MetricCard`, `AverageRatingCard`, rating
  distribution) move to `components/dashboard/overview-view.tsx` and take plain data props.

The tenant pages call these with the user (RLS) client and their own `profile.clientId`
(managers still get `locationId` forced to their location). The agency pages call them
with `createAdminClient()` and the `clientId` from the URL. The shared functions never
import the admin client themselves and always apply `.eq("client_id", clientId)`.

## Authorization

- Every page and layout under `/dashboard/admin` calls `await requireSuperadmin()` as
  its first statement (layouts are not re-run on every navigation, so each page repeats it).
- Every new server action calls `requireSuperadmin()` first.
- The URL `clientId` is validated as a UUID and must exist, otherwise `notFound()`.
- Service-role reads happen only in agency routes; tenant routes keep using RLS.

## New server actions (`admin/actions.ts`)

- `updateClientAction(prev, formData)`: `clientId`, `name`, `slug`; slug uniqueness errors via `describeDbError`.
- `updateLocationAction(prev, formData)`: `locationId`, `name`, `googleReviewUrl`; the
  location must exist (client derived server-side); slug is not accepted.
- `deleteClientAction(formData)`: `clientId`, `confirmSlug`; refuses unless `confirmSlug`
  equals the client's slug; deletion cascades through the existing foreign keys. Deleting
  a client also deletes its auth users: the action first lists the client's profile ids,
  deletes each auth user, then deletes the client row.

Existing actions (`createClientAction`, `createLocationAction`, `createUserAction`,
`resetPasswordAction`, `deleteUserAction`, `deleteLocationAction`) stay as they are;
`revalidatePath` targets move to the new routes.

## Error handling and empty states

- Queries throw on error (no misleading empty state), as in the current client page.
- A client with no locations/users/reviews shows an explicit empty message with the next
  action ("Add the first location").
- The tab bar highlights the active section; unknown `clientId` gives the standard 404.

## Testing

- Unit: `loadOverviewData` and `loadReviewsPage` with a recording fake client, asserting
  `client_id` scoping is always applied, filters compose, and pagination math.
- Unit: new actions reject non-superadmins before creating the admin client,
  `deleteClientAction` refuses a wrong `confirmSlug`, `updateLocationAction` ignores any
  `slug` field.
- Regression: existing tenant overview and reviews pages still render the same data
  (`npm test` plus manual check as admin and as manager).
- Manual: open each tab for two clients and confirm no data crosses between them.

## Rollout

No migrations. Code-only deploy of the branch. Deploying does not change what clients see.

## Risks

- Refactoring the tenant overview/reviews queries could regress tenant dashboards.
  Mitigation: move code without changing queries, keep tests, verify both roles manually.
- Deleting a client is irreversible. Mitigation: typed slug confirmation, panel-only.
- Service-role reads expose all tenant data to the page; the `requireSuperadmin()` calls
  in every page and layout are the only gate.
