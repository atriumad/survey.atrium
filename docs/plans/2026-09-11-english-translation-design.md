# Full app translation: Spanish to English

## Context

Login was already redesigned and translated to English. The rest of the
app — Overview, Reviews, Config, the sidebar, the public review flow, and
every error/empty-state message — is still in Spanish. The client wants
the whole UI in English.

Direct 1:1 translation (no tone/style polishing), decided explicitly. Two
exceptions where literal word-for-word would be wrong, not just
unpolished, because the Spanish word is a "false friend" in English:

- **"Regular"** (Spanish, meaning "mediocre/so-so") → **"Average"**, not
  "Regular" — the English word "regular" means "normal/usual," not
  "mediocre." Keeping the same spelling would silently change the meaning
  of the rating-tier scale.
- **"Configuracion"** → the page is being renamed to **"Settings"**
  (superseding an earlier draft that used the literal "Configuration") per
  the client's explicit request in the same conversation that asked for
  this page's UI/logic to be improved separately (see Out of Scope below).

`app/layout.tsx`'s `lang="es"` also becomes `lang="en"` (the document's
declared locale) — approved as in-scope even though it's not visible copy.

## Full string inventory and translations

### `lib/metrics.ts`
- `"Sin datos aun"` → `"No data yet"`
- `"Excelente"` → `"Excellent"`
- `"Muy bien"` → `"Very good"`
- `"Regular"` → `"Average"` (see false-friend note above)
- `"A mejorar"` → `"Needs improvement"`

### `lib/csv.ts`
- CSV header row `"fecha,rating,clasificacion,comentario,keywords\n"` →
  `"date,rating,classification,comment,keywords\n"`

### `app/dashboard/(protected)/sidebar.tsx`
- `"Cerrar sesion"` → `"Sign out"`
- Nav item `"Config"` → `"Settings"` (href stays `/dashboard/config`,
  unchanged — only the label text changes)

### `app/dashboard/(protected)/layout.tsx`
- `"No tenes acceso a este dashboard."` → `"You don't have access to this dashboard."`
- `"Cerrar sesion"` → `"Sign out"`

### `app/dashboard/(protected)/location-filter.tsx`
- `"Todos los locales"` → `"All locations"` (already applied ahead of this
  plan, as part of the same-file bug fix for the location-id display bug)

### `app/dashboard/(protected)/page.tsx`
- `"% Buenas"` → `"% Good"`
- `"% Compartidas a Google"` → `"% Shared to Google"`
- `"Escaneos QR"` → `"QR Scans"`
- `"Rating promedio"` → `"Average rating"`
- `"Distribucion de estrellas"` → `"Star distribution"`
- `"Ultimas 24 horas"` → `"Last 24 hours"`

### `app/dashboard/(protected)/reviews/reviews-table.tsx`
- `"Exportar CSV"` → `"Export CSV"`
- `"Fecha"` → `"Date"`
- `"Clasificacion"` → `"Classification"`
- `"Comentario"` → `"Comment"`
- `"Sin reviews todavia."` → `"No reviews yet."`

### `app/dashboard/(protected)/config/page.tsx`
- `"Configuracion"` → `"Settings"`
- `"Locales, codigos QR y palabras clave para clasificar reviews."` →
  `"Locations, QR codes, and keywords used to classify reviews."`

### `app/dashboard/(protected)/config/locations-section.tsx`
- `"Locales"` → `"Locations"`
- `"Agregar local"` → `"Add location"`
- `"Nombre"` → `"Name"`
- placeholder `"Sucursal Centro"` → `"Downtown Branch"`
- placeholder `"centro"` → `"downtown"`
- `"Google Place ID (opcional)"` → `"Google Place ID (optional)"`
- `"Agregar"` → `"Add"`
- `"Todavia no agregaste ningun local."` → `"You haven't added any locations yet."`
- `"Descargar QR"` → `"Download QR"`
- `"Eliminar"` → `"Delete"`

### `app/dashboard/(protected)/config/keywords-section.tsx`
- `"Palabras clave negativas"` → `"Negative keywords"`
- `"Agregar palabra clave"` → `"Add keyword"`
- `"Palabra"` → `"Keyword"`
- placeholder `"ej: lento, sucio, frio"` → `"e.g. slow, dirty, cold"`
- `"Agregar"` → `"Add"`
- `"Todavia no agregaste palabras clave."` → `"You haven't added any keywords yet."`

### `app/r/[locationSlug]/review-form.tsx`
- `STEPS = ["Correo", "Tu opinión", "Google"]` → `["Email", "Your feedback", "Google"]`
- `"Ingresá tu correo electrónico."` → `"Enter your email address."`
- `"Ingresá un correo electrónico válido."` → `"Enter a valid email address."`
- `"Contanos qué pasó para poder mejorar."` (validation message) → `"Tell us what happened so we can improve."`
- `"No pudimos guardar tu review."` → `"We couldn't save your review."`
- `aria-label="Progreso"` → `"Progress"`
- `"Correo electrónico"` (label) → `"Email address"`
- placeholder `"tucorreo@ejemplo.com"` → `"you@example.com"`
- `"Continuar"` (both occurrences) → `"Continue"`
- `aria-label="Calificación"` → `"Rating"`
- `` aria-label={`${star} estrellas`} `` → `` `${star} stars` ``
- `"Comentario (requerido)"` / `"Comentario (opcional)"` → `"Comment (required)"` / `"Comment (optional)"`
- placeholder `"Contanos qué pasó para poder mejorar"` (no trailing period) → `"Tell us what happened so we can improve"`
- placeholder `"Contanos tu experiencia"` → `"Tell us about your experience"`
- `"Atrás"` (both occurrences) → `"Back"`
- `"Enviando..."` (both occurrences) → `"Sending..."`
- `"Enviar"` → `"Send"`
- `"¿Querés compartir tu opinión en Google?"` → `"Want to share your review on Google?"`
- `"No, gracias"` → `"No, thanks"`
- `"Sí, compartir"` → `"Yes, share"`

### `app/r/[locationSlug]/actions.ts`
- `"Espera un momento antes de enviar otra review"` (thrown error, shown to
  the user via the form's catch block) → `"Please wait a moment before submitting another review"`

### `app/r/[locationSlug]/page.tsx`
- `"Cual fue tu experiencia hoy?"` → `"How was your experience today?"`

### `app/r/[locationSlug]/not-found.tsx`
- `"Local no encontrado"` → `"Location not found"`
- `"Revisa el codigo QR o contacta al local."` → `"Check the QR code or contact the location."`

### `app/r/[locationSlug]/gracias/page.tsx`
- `"Gracias por tu opinion!"` → `"Thanks for your feedback!"`
- `"Tu feedback nos ayuda a mejorar cada dia."` → `"Your feedback helps us improve every day."`

### `app/r/[locationSlug]/gracias/share-google.tsx`
- `"Te gustaria compartir tu opinion en Google?"` → `"Want to share your review on Google?"`
- `"Copiado!"` → `"Copied!"`
- `"Copiar mi review"` → `"Copy my review"`
- `"Abrir Google"` → `"Open Google"`

### `app/layout.tsx`
- `lang="es"` → `lang="en"`

## Already English (no action)

`app/dashboard/login/page.tsx`, `app/dashboard/login/actions.ts`,
`app/dashboard/(protected)/config/actions.ts`,
`app/dashboard/(protected)/reviews/page.tsx` ("Reviews" heading), the
sidebar's "Overview"/"Reviews" nav labels, all `components/ui/*`
primitives, `app/layout.tsx` metadata (title/description), the
`good`/`bad` classification enum values rendered verbatim in
`reviews-table.tsx`'s badge (already English words; a nicer capitalized
label is a separate polish item, not part of this translation).

## Out of scope (tracked separately, per the client's own follow-up ask)

- Redesigning the Settings (formerly Config) page's UI/logic beyond the
  rename+translation above.
- Adding user-profile editing.
- Any change to the Reviews table's columns, star-rating display, or
  pagination.
- Any visual change to the Overview hero card beyond what's already
  shipped.

These are real feature/UX work, not translation — each gets its own
brainstorming pass and design doc.

## Testing

No business logic changes — this is string-literal replacement across 14
files plus one HTML attribute. Verification: `bunx tsc --noEmit`,
`bun test` (all existing tests should still pass unchanged — none of them
assert on UI copy text), `bun run build`, and a manual click-through of
each touched screen to confirm no Spanish text remains
(`grep -rn` for a sample of distinctive Spanish words like "reviews todavia"
or "Ingresá" across `app/` should return nothing after the change).
