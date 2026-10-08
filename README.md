This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Multi-tenant operations

### Environment
`SUPABASE_SERVICE_ROLE_KEY` is required on the server (Vercel: Production and Preview, never exposed to the browser). The superadmin panel uses it.

### First superadmin
Create the auth user in Supabase Dashboard (Authentication > Users > Add user), then run:

```sql
insert into profiles (id, client_id, role)
select id, null, 'superadmin' from auth.users where email = 'YOUR_EMAIL';
```

### Onboarding a client
Log in as superadmin, open `/dashboard/admin`, create the client, add its locations (slugs are globally unique, so prefix them with the client slug), then create the client's admin user and hand over the generated password.

### Isolation test
`psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql` (rolls back; run after any RLS change).
