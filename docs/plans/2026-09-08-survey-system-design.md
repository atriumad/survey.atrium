# Sistema de Survey/Reviews — Diseño

**Fecha:** 2026-09-08
**Estado:** Aprobado, pendiente implementación

## Contexto

Sistema de encuestas de satisfacción para un cliente con múltiples locales. Flujo: QR en mesas → página pública de review con rating de estrellas → clasificación automática good/bad review → thank you page (con opción de compartir en Google si es buena review) → dashboard admin para ver métricas.

Diseñado multi-tenant desde el modelo de datos (`client_id` en todas las tablas), aunque hoy solo opera un cliente con varios locales. Escalar a más clientes en el futuro no requiere refactor de esquema.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind + shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Vercel (deploy)
- Vitest (tests unitarios)

App única (no monorepo): rutas públicas y rutas protegidas de dashboard conviven en el mismo proyecto Next.js, separadas por middleware de auth.

## Rutas

- `/r/[locationSlug]` — página pública de review (destino del QR)
- `/r/[locationSlug]/gracias` — thank you page, CTA condicional a compartir en Google
- `/dashboard/login`
- `/dashboard` — home con métricas
- `/dashboard/reviews` — listado/filtro/export CSV
- `/dashboard/config` — CRUD locations, keywords negativas, usuarios, generador de QR (solo admin)

## Modelo de datos

```
clients
  id, name, slug, created_at
  -- branding (logo_url, primary_color, etc) se completa cuando el cliente comparta su identidad visual

locations
  id, client_id (fk), name, slug, google_place_id, created_at

negative_keywords
  id, client_id (fk), keyword, created_at
  -- editable desde dashboard

reviews
  id, client_id (fk), location_id (fk)
  rating (1-5)
  comment (text, nullable)
  classification ('good' | 'bad')
  matched_keywords (text[], nullable)
  shared_to_google (bool, default false)
  created_at

profiles
  id (= auth.users.id), client_id (fk), role ('admin' | 'manager'), location_id (nullable fk)
  -- admin: location_id null, ve todo el client
  -- manager: location_id set, ve solo su local
```

**RLS:**
- `anon`: INSERT en `reviews`, SELECT en `locations`/`clients` (para pintar la página pública). Nada más.
- Autenticado: todo filtrado por `client_id` derivado de su `profiles` row. Manager además filtrado por `location_id`.

## Clasificación good/bad

Al hacer submit, server action calcula:
- `rating >= 4` **y** comentario sin match contra `negative_keywords` del client → `good`
- `rating <= 3` **o** comentario matchea alguna keyword negativa → `bad`

Lista de keywords es simple texto plano, editable por client desde `/dashboard/config`. Sin LLM/sentiment analysis en v1 (costo/latencia innecesarios para este alcance).

## Flujo público

1. Scan QR → `/r/[locationSlug]`
2. Selector de estrellas (1-5) + textarea comentario (opcional si rating ≥4, requerido si rating ≤3)
3. Submit → clasifica, guarda, redirige a `/r/[locationSlug]/gracias?c=good|bad`
4. Thank you page:
   - `good`: CTA "Compartir en Google" → botón "Copiar mi review" (clipboard) + botón "Abrir Google" (`https://search.google.com/local/writereview?placeid={google_place_id}`), marca `shared_to_google=true` al click de abrir
   - `bad`: solo agradecimiento, sin CTA de Google — no se expone crítica públicamente

Sin login para el cliente final, cero fricción.

## Dashboard

**Home:** selector de local (admin: todos + "todos los locales"; manager: fijo a su local, sin selector) + cards (total reviews, rating promedio, % good/bad, % compartidas a Google) + gráfico de tendencia (rating promedio, últimos 30 días) + distribución de estrellas.

**Reviews:** tabla filtrable (local, rango de fecha, good/bad), export CSV respetando filtros activos (client-side, sobre las rows cargadas).

**Config (solo admin):** CRUD locations (incluye `google_place_id`), CRUD negative_keywords, generador/descarga de QR por local (PNG/SVG, apunta a `/r/[slug]`), CRUD de usuarios/invitación de managers.

**Notificaciones:** ninguna en v1. Reviews malas quedan solo en dashboard, sin email/whatsapp automático — se agrega después si hace falta.

## Manejo de errores

- Validación server-side con Zod (rating, longitud de comentario, existencia de location) antes de insertar.
- Rate limiting básico por IP en el submit público, evita spam desde el mismo QR.
- RLS como última línea de defensa aunque falle la validación de la app.
- 404 amigable si `locationSlug` no existe.
- Dashboard: pantalla de "sin acceso" si el usuario autenticado no tiene `profiles` row, sin crash.

## Testing

- Vitest: función de clasificación (rating + keywords → good/bad), utilidad de export CSV, Zod schemas.
- Sin E2E automatizado en v1. Se verifica manualmente en browser antes de dar por terminada cualquier feature de UI.

## Fuera de alcance v1

- Branding real (se aplica cuando el cliente comparte identidad visual — hoy se deja tokens de diseño swappable)
- Multi-tenant activo (varios clients simultáneos) — modelo lo soporta, no hay UI de onboarding de nuevo client todavía
- Notificaciones automáticas de reviews negativas
- QR por mesa individual (se usa QR genérico por local)
- Sentiment analysis con LLM
