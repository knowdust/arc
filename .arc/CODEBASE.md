# CODEBASE MAP
> Auto-generated from `project.arch` on 2026-03-06T09:18:46.207Z
> Run `arch map` to regenerate. Do not edit manually.

---

## Project: note-app
- **Version**: 1.0.0
- **Stack**: nextjs + supabase + prisma + polar + shadcn + tailwind + language + typescript
- **Language**: typescript

---

## Summary
Next.js 14 note-taking app using App Router and TypeScript.
    Auth via Supabase Google OAuth — profiles row auto-created via DB trigger.
    Payments via Polar.sh sandbox — webhook updates profiles.is_paid to gate protected pages.
    All DB access via Prisma ORM — never call Prisma directly from components.
    UI built with shadcn/ui and Tailwind CSS.
    Server actions in /actions, types in /types, infrastructure in /lib.

### Critical Files
- `project.arch`
- `prisma/schema.prisma`
- `src/types/index.ts`
- `src/lib/db.ts`
- `src/lib/polar.ts`
- `src/actions/notes.ts`
- `src/actions/profiles.ts`
- `src/actions/payments.ts`

### Do Not Touch
- `src/components/ui/`
- `prisma/schema.prisma auth-schema models`

---

## Architecture Layers

| Layer | Path | Can Import From | Files |
|---|---|---|---|
| **types** | `src/types` | — | 0 |
| **lib** | `src/lib` | types | 0 |
| **actions** | `src/actions` | types, lib | 0 |
| **hooks** | `src/hooks` | types, lib | 0 |
| **components** | `src/components/app` | types, hooks, lib | 0 |
| **ui** | `src/components/ui` | types | 0 |
| **app** | `src/app` | types, hooks, components, actions, lib | 0 |

### Descriptions
- **types**: All TypeScript types. No logic, no side effects.
- **lib**: Infrastructure: Prisma client, Supabase client, Polar helpers.
- **actions**: Server actions. All DB access lives here. Must use 'use server'. *(requires `"use server"`)*
- **hooks**: React hooks. Client-side only. Must use 'use client'. *(requires `"use client"`)*
- **components**: App components. No direct Prisma. No direct Supabase.
- **ui** *(readonly)*: shadcn components. Never manually edit.
- **app**: Next.js pages and API routes. Top of the stack.

---

## Data Flows

### auth
Google OAuth → Supabase creates auth.users → DB trigger creates profiles row

**Steps**:
1. user clicks Sign In with Google
2. supabase auth redirects to Google
3. callback hits src/app/api/auth/callback/route.ts
4. profiles row auto-created via DB trigger

**Files**: `src/lib/supabase.ts`, `src/app/api/auth/callback/route.ts`
**Tables**: `auth.users`, `public.profiles`

### payment
Polar checkout → webhook → profiles.is_paid = true → access granted

**Steps**:
1. user clicks Upgrade
2. redirect to Polar checkout
3. user pays
4. Polar POSTs to /api/webhooks/polar
5. route.ts calls actions/payments.ts
6. prisma updates profiles.is_paid = true
7. protected pages now render

**Files**: `src/app/api/webhooks/polar/route.ts`, `src/lib/polar.ts`, `src/actions/payments.ts`
**Tables**: `public.profiles`
**Key fields**: `profiles.is_paid`, `profiles.polar_customer_id`, `profiles.purchased_at`

### notes
Authenticated user CRUD on notes via server actions + Prisma

**Steps**:
1. component calls server action
2. action validates auth session
3. action calls prisma
4. prisma queries Supabase Postgres
5. data returned to component

**Files**: `src/actions/notes.ts`, `src/hooks/useNotes.ts`
**Tables**: `public.notes`, `public.note_versions`, `public.notes_history_snapshots`

### access-control
Protected pages check profiles.is_paid — redirect to /upgrade if false

**Steps**:
1. user hits protected route
2. layout.tsx calls actions/profiles.ts
3. checks profiles.is_paid
4. if false redirect to /upgrade

**Files**: `src/app/(protected)/layout.tsx`, `src/actions/profiles.ts`
**Key fields**: `profiles.is_paid`

---

## Rules (5)

| ID | Severity | Description |
|---|---|---|
| `no-prisma-outside-lib-actions` | 🔴 error | Prisma can only be used in lib and actions layers |
| `no-supabase-server-in-client` | 🔴 error | Supabase SSR client cannot be used in components or hooks |
| `no-direct-db-in-components` | 🔴 error | Components cannot import the Prisma db client directly |
| `no-any-types` | 🟡 warning | Avoid 'any' — use proper types from src/types |
| `no-console-in-production` | 🟡 warning | Remove console.log before shipping |

---

## Naming Conventions

| Name | Pattern |
|---|---|
| `server-action` | `src/actions/{domain}.ts` |
| `hook` | `src/hooks/use{Name}.ts` |
| `component` | `src/components/app/{Name}.tsx` |
| `api-route` | `src/app/api/{path}/route.ts` |
| `page` | `src/app/{path}/page.tsx` |

---

## File Tree

```
src/
  (not found)
```
