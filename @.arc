# project.arch
# Architecture definition file for your codebase
# Parsed and enforced by the arch CLI

arch "note-app" {
  version  "1.0.0"
  stack    nextjs + supabase + prisma + polar + shadcn + tailwind
  language typescript
}

# ── Layers ────────────────────────────────────────────────────
# Declare every layer in your codebase.
# "can import" defines the only allowed import directions.
# Violations = arch check fails.

layer types {
  path        "src/types"
  description "All TypeScript types. No logic, no side effects."
  can import  []
}

layer lib {
  path        "src/lib"
  description "Infrastructure: Prisma client, Supabase client, Polar helpers."
  can import  [types]
}

layer actions {
  path        "src/actions"
  description "Server actions. All DB access lives here. Must use 'use server'."
  can import  [types, lib]
  require directive "use server"
}

layer hooks {
  path        "src/hooks"
  description "React hooks. Client-side only. Must use 'use client'."
  can import  [types, lib]
  require directive "use client"
}

layer components {
  path        "src/components/app"
  description "App components. No direct Prisma. No direct Supabase."
  can import  [types, hooks, lib]
}

layer ui {
  path        "src/components/ui"
  description "shadcn components. Never manually edit."
  can import  [types]
  readonly
}

layer app {
  path        "src/app"
  description "Next.js pages and API routes. Top of the stack."
  can import  [types, hooks, components, actions, lib]
}

# ── Rules ─────────────────────────────────────────────────────
# Custom rules enforced across the entire codebase.
# severity: error (blocks build) | warning (prints but continues)

rule "no-prisma-outside-lib-actions" {
  severity    error
  description "Prisma can only be used in lib and actions layers"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

rule "no-supabase-server-in-client" {
  severity    error
  description "Supabase SSR client cannot be used in components or hooks"
  forbid import "@supabase/ssr"
  except in   [lib, actions, app]
}

rule "no-direct-db-in-components" {
  severity    error
  description "Components cannot import the Prisma db client directly"
  forbid import "@/lib/db"
  except in   [actions, lib]
}

rule "no-any-types" {
  severity    warning
  description "Avoid 'any' — use proper types from src/types"
  forbid pattern ": any"
  in layers   [actions, lib, types]
}

rule "no-console-in-production" {
  severity    warning
  description "Remove console.log before shipping"
  forbid pattern "console.log"
  in layers   [components, hooks, app]
}

# ── Flows ─────────────────────────────────────────────────────
# Document how data moves through your app.
# Not enforced — used for AI context and arch map generation.

flow auth {
  description "Google OAuth → Supabase creates auth.users → DB trigger creates profiles row"
  steps [
    "user clicks Sign In with Google"
    "supabase auth redirects to Google"
    "callback hits src/app/api/auth/callback/route.ts"
    "profiles row auto-created via DB trigger"
  ]
  touches ["src/lib/supabase.ts", "src/app/api/auth/callback/route.ts"]
  tables  ["auth.users", "public.profiles"]
}

flow payment {
  description "Polar checkout → webhook → profiles.is_paid = true → access granted"
  steps [
    "user clicks Upgrade"
    "redirect to Polar checkout"
    "user pays"
    "Polar POSTs to /api/webhooks/polar"
    "route.ts calls actions/payments.ts"
    "prisma updates profiles.is_paid = true"
    "protected pages now render"
  ]
  touches ["src/app/api/webhooks/polar/route.ts", "src/lib/polar.ts", "src/actions/payments.ts"]
  tables  ["public.profiles"]
  fields  ["profiles.is_paid", "profiles.polar_customer_id", "profiles.purchased_at"]
}

flow notes {
  description "Authenticated user CRUD on notes via server actions + Prisma"
  steps [
    "component calls server action"
    "action validates auth session"
    "action calls prisma"
    "prisma queries Supabase Postgres"
    "data returned to component"
  ]
  touches ["src/actions/notes.ts", "src/hooks/useNotes.ts"]
  tables  ["public.notes", "public.note_versions", "public.notes_history_snapshots"]
}

flow access-control {
  description "Protected pages check profiles.is_paid — redirect to /upgrade if false"
  steps [
    "user hits protected route"
    "layout.tsx calls actions/profiles.ts"
    "checks profiles.is_paid"
    "if false redirect to /upgrade"
  ]
  touches ["src/app/(protected)/layout.tsx", "src/actions/profiles.ts"]
  fields  ["profiles.is_paid"]
}

# ── Conventions ───────────────────────────────────────────────
# Naming conventions for files. Used by arch scaffold.

convention server-action  "src/actions/{domain}.ts"
convention hook           "src/hooks/use{Name}.ts"
convention component      "src/components/app/{Name}.tsx"
convention api-route      "src/app/api/{path}/route.ts"
convention page           "src/app/{path}/page.tsx"

# ── Context ───────────────────────────────────────────────────
# AI-readable summary of the entire project.
# Paste this file into Claude/Cursor for instant codebase understanding.

context {
  summary """
    Next.js 14 note-taking app using App Router and TypeScript.
    Auth via Supabase Google OAuth — profiles row auto-created via DB trigger.
    Payments via Polar.sh sandbox — webhook updates profiles.is_paid to gate protected pages.
    All DB access via Prisma ORM — never call Prisma directly from components.
    UI built with shadcn/ui and Tailwind CSS.
    Server actions in /actions, types in /types, infrastructure in /lib.
  """

  critical-files [
    "project.arch"
    "prisma/schema.prisma"
    "src/types/index.ts"
    "src/lib/db.ts"
    "src/lib/polar.ts"
    "src/actions/notes.ts"
    "src/actions/profiles.ts"
    "src/actions/payments.ts"
  ]

  do-not-touch [
    "src/components/ui/"
    "prisma/schema.prisma auth-schema models"
  ]
}