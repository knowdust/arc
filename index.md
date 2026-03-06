# ARCH — Architecture Compiler for Next.js + Supabase + Prisma

> A single source of truth for your codebase — like `schema.prisma` but for architecture.
> Enforces rules at compile time, generates maps, and gives AI instant codebase context.

---

## What You're Building

```md
schema.prisma          → single source of truth for your DB
arch.config.ts         → single source of truth for your architecture
scripts/arch-check.ts  → compiler that enforces the rules
scripts/arch-map.ts    → generator that maps your codebase
```

When `npm run build` runs, your architecture is **validated like types are validated**.
If you violate a rule, the build fails with a clear error — just like a TypeScript error.

---

## Folder Structure (End State)

```md
your-app/
├── arch.config.ts                  ← 🧠 THE file. Your architecture compiler config.
├── prisma/
│   └── schema.prisma               ← DB source of truth (already done)
├── src/
│   ├── types/
│   │   └── index.ts                ← All app types derived from Prisma
│   ├── lib/
│   │   ├── db.ts                   ← Single Prisma client instance
│   │   ├── supabase.ts             ← Supabase client (server + client)
│   │   └── polar.ts                ← Polar.sh webhook helpers
│   ├── actions/
│   │   ├── notes.ts                ← All note DB operations
│   │   ├── profiles.ts             ← All profile DB operations
│   │   └── payments.ts             ← All payment logic
│   ├── hooks/
│   │   ├── useNotes.ts
│   │   └── useProfile.ts
│   ├── components/
│   │   ├── ui/                     ← shadcn (never edit)
│   │   └── app/                    ← your components
│   └── app/
│       ├── api/
│       │   └── webhooks/
│       │       └── polar/
│       │           └── route.ts
│       └── (protected)/
│           └── dashboard/
├── scripts/
│   ├── arch-check.ts               ← enforcer
│   ├── arch-map.ts                 ← mapper
│   └── arch-scaffold.ts            ← generator
└── .arch/
    └── CODEBASE.md                 ← auto-generated map (gitignore or commit)
```

---

## Step 1 — Install Dependencies

```bash
npm install --save-dev ts-morph glob chalk
npm install --save-dev @types/node
```

---

## Step 2 — `arch.config.ts`

Create this at your project root. This is your entire architecture in one file.

```ts
// arch.config.ts
// ============================================================
// ARCH CONFIG — Single source of truth for codebase architecture
// Like schema.prisma but for your entire app structure
// ============================================================

// ── Stack Declaration ────────────────────────────────────────
export const stack = {
  framework:  'nextjs-14',
  database:   'supabase-postgres',
  orm:        'prisma',
  auth:       'supabase-auth',
  payments:   'polar',
  ui:         'shadcn-ui',
  styling:    'tailwind',
  language:   'typescript',
} as const

// ── Layer Definitions ────────────────────────────────────────
// Each layer can only import from layers listed in canImportFrom.
// Violations = build error.

export const layers = {
  types: {
    path: 'src/types',
    description: 'All TypeScript types. No logic. No imports from app.',
    canImportFrom: [],
    filePattern: '*.ts',
  },
  lib: {
    path: 'src/lib',
    description: 'Infrastructure: Prisma client, Supabase client, Polar helpers.',
    canImportFrom: ['types'],
    filePattern: '*.ts',
  },
  actions: {
    path: 'src/actions',
    description: 'Server actions. All DB access happens here. Never called client-side directly.',
    canImportFrom: ['types', 'lib'],
    filePattern: '*.ts',
  },
  hooks: {
    path: 'src/hooks',
    description: 'React hooks. Client-side only. Can call actions via fetch/mutation.',
    canImportFrom: ['types', 'lib'],
    filePattern: '*.ts',
  },
  components: {
    path: 'src/components/app',
    description: 'Your app components. No direct Prisma. No direct Supabase.',
    canImportFrom: ['types', 'hooks', 'lib'],
    filePattern: '*.tsx',
  },
  ui: {
    path: 'src/components/ui',
    description: 'shadcn components. Never manually edit these.',
    canImportFrom: ['types'],
    filePattern: '*.tsx',
    readonly: true,
  },
  app: {
    path: 'src/app',
    description: 'Next.js pages and API routes. Orchestrates everything.',
    canImportFrom: ['types', 'hooks', 'components', 'actions', 'lib'],
    filePattern: '*.tsx',
  },
} as const

export type LayerName = keyof typeof layers

// ── Architecture Rules ────────────────────────────────────────
// Each rule has an id, description, and how to check it.

export const rules = [
  {
    id: 'no-prisma-outside-lib-actions',
    description: 'Prisma client can only be used in src/lib and src/actions',
    severity: 'error' as const,
    check: 'import-pattern',
    pattern: '@prisma/client',
    allowedIn: ['src/lib', 'src/actions'],
  },
  {
    id: 'no-supabase-server-in-client',
    description: 'Supabase server client cannot be imported in components or hooks',
    severity: 'error' as const,
    check: 'import-pattern',
    pattern: '@supabase/ssr',
    allowedIn: ['src/lib', 'src/actions', 'src/app'],
  },
  {
    id: 'server-actions-must-use-server',
    description: 'All files in src/actions must have "use server" directive',
    severity: 'error' as const,
    check: 'directive',
    directive: 'use server',
    requiredIn: ['src/actions'],
  },
  {
    id: 'no-direct-db-in-components',
    description: 'Components cannot import from src/lib/db directly',
    severity: 'error' as const,
    check: 'import-pattern',
    pattern: '@/lib/db',
    allowedIn: ['src/actions', 'src/lib'],
  },
  {
    id: 'hooks-must-be-client',
    description: 'All files in src/hooks must have "use client" directive',
    severity: 'warning' as const,
    check: 'directive',
    directive: 'use client',
    requiredIn: ['src/hooks'],
  },
  {
    id: 'no-any-types',
    description: 'Avoid using "any" type — use proper types from src/types',
    severity: 'warning' as const,
    check: 'code-pattern',
    pattern: ': any',
    forbiddenIn: ['src/actions', 'src/lib', 'src/types'],
  },
  {
    id: 'no-hardcoded-user-id',
    description: 'Never hardcode user IDs — always get from auth session',
    severity: 'error' as const,
    check: 'code-pattern',
    pattern: 'user_id.*=.*"',
    forbiddenIn: ['src/components', 'src/app'],
  },
] as const

// ── Data Flow Declaration ─────────────────────────────────────
// Documents how data moves through your app.
// Read this to understand the app without opening any file.

export const dataFlow = {
  auth: {
    description: 'User signs in via Google → Supabase creates auth.users entry → DB trigger creates public.profiles row',
    files: ['src/lib/supabase.ts', 'src/app/api/auth/callback/route.ts'],
    tables: ['auth.users', 'public.profiles'],
  },
  payment: {
    description: 'User clicks upgrade → Polar checkout → User pays → Polar POSTs webhook → /api/webhooks/polar → updates profiles.is_paid = true',
    files: ['src/app/api/webhooks/polar/route.ts', 'src/lib/polar.ts', 'src/actions/payments.ts'],
    tables: ['public.profiles'],
    fields: ['profiles.is_paid', 'profiles.polar_customer_id', 'profiles.purchased_at', 'profiles.current_plan'],
  },
  notes: {
    description: 'Authenticated user → server action → Prisma → Supabase Postgres → returned to component via hook',
    files: ['src/actions/notes.ts', 'src/hooks/useNotes.ts'],
    tables: ['public.notes', 'public.note_versions', 'public.notes_history_snapshots'],
  },
  accessControl: {
    description: 'Protected pages check profiles.is_paid before rendering. Redirect to /upgrade if false.',
    files: ['src/app/(protected)/layout.tsx', 'src/actions/profiles.ts'],
    fields: ['profiles.is_paid'],
  },
} as const

// ── Naming Conventions ────────────────────────────────────────

export const conventions = {
  serverAction:   (domain: string) => `src/actions/${domain}.ts`,
  hook:           (name: string)   => `src/hooks/use${name}.ts`,
  component:      (name: string)   => `src/components/app/${name}.tsx`,
  apiRoute:       (path: string)   => `src/app/api/${path}/route.ts`,
  page:           (path: string)   => `src/app/${path}/page.tsx`,
  layout:         (path: string)   => `src/app/${path}/layout.tsx`,
} as const

// ── AI Context ───────────────────────────────────────────────
// Paste this file into any AI chat for instant full codebase understanding.

export const aiContext = {
  summary: `
    Next.js 14 note-taking app. App router. TypeScript.
    Auth: Supabase Google OAuth → profiles table auto-created via DB trigger.
    Payments: Polar.sh sandbox → webhook → profiles.is_paid boolean gates protected pages.
    DB: Supabase Postgres accessed exclusively via Prisma ORM.
    UI: shadcn/ui + Tailwind.
    Server actions in /actions — never call Prisma from components directly.
    Types all live in src/types/index.ts derived from Prisma generated types.
  `,
  criticalFiles: [
    'arch.config.ts',           // THIS FILE — full architecture
    'prisma/schema.prisma',     // full DB schema  
    'src/types/index.ts',       // all app types
    'src/lib/db.ts',            // prisma singleton
    'src/lib/polar.ts',         // payment webhook logic
    'src/actions/notes.ts',     // all note operations
    'src/actions/profiles.ts',  // all profile operations
  ],
  doNotTouch: [
    'src/components/ui/',       // shadcn — never edit manually
    'prisma/schema.prisma auth schema models', // Supabase managed
  ],
} as const
```

---

## Step 3 — `src/types/index.ts`

Your type layer — derived from Prisma, extended for your app.

```ts
// src/types/index.ts
import type { notes, profiles, note_versions, notes_history_snapshots } from '@prisma/client'

// ── Raw DB Types (from Prisma) ────────────────────────────────
export type Note = notes
export type Profile = profiles
export type NoteVersion = note_versions
export type NoteSnapshot = notes_history_snapshots

// ── Extended App Types ────────────────────────────────────────
export type NoteWithAuthor = notes & {
  users: { email: string | null }
}

export type ProfileWithStatus = profiles & {
  isPro: boolean
  isNew: boolean
}

// ── Action Return Types ───────────────────────────────────────
export type ActionResult<T> =
  | { success: true;  data: T }
  | { success: false; error: string }

// ── Payment Types ─────────────────────────────────────────────
export type PolarWebhookPayload = {
  type: string
  data: {
    customer: { email: string }
    id: string
  }
}

// ── Auth Types ────────────────────────────────────────────────
export type AuthUser = {
  id: string
  email: string | null
}
```

---

## Step 4 — `src/lib/db.ts`

Single Prisma client instance. Import this everywhere — never instantiate Prisma directly.

```ts
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

---

## Step 5 — `scripts/arch-check.ts`

The compiler. Runs your rules against your codebase.

```ts
// scripts/arch-check.ts
import { Project, SyntaxKind } from 'ts-morph'
import { layers, rules } from '../arch.config'
import path from 'path'
import fs from 'fs'
import chalk from 'chalk'

// ── Types ─────────────────────────────────────────────────────
type Violation = {
  rule: string
  severity: 'error' | 'warning'
  file: string
  message: string
  line?: number
}

const violations: Violation[] = []
const project = new Project({ tsConfigFilePath: 'tsconfig.json' })

// ── Helper: resolve layer for a file path ────────────────────
function getLayerForFile(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/')
  for (const [name, layer] of Object.entries(layers)) {
    if (normalized.includes(layer.path)) return name
  }
  return null
}

// ── Check 1: Import Boundary Violations ──────────────────────
console.log(chalk.blue('\n🔍 Checking import boundaries...'))

for (const [layerName, layer] of Object.entries(layers)) {
  if ((layer as any).readonly) continue

  const files = project.getSourceFiles(`${layer.path}/**/*.{ts,tsx}`)

  for (const file of files) {
    const filePath = file.getFilePath()
    const imports = file.getImportDeclarations()

    for (const imp of imports) {
      const importPath = imp.getModuleSpecifierValue()

      // Only check @/ absolute imports
      if (!importPath.startsWith('@/')) continue

      const importedPath = importPath.replace('@/', 'src/')

      for (const [otherLayerName, otherLayer] of Object.entries(layers)) {
        if (otherLayerName === layerName) continue
        if (!importedPath.startsWith(otherLayer.path)) continue

        const allowed = (layer.canImportFrom as readonly string[]).includes(otherLayerName)

        if (!allowed) {
          const lineNumber = imp.getStartLineNumber()
          violations.push({
            rule: 'import-boundary',
            severity: 'error',
            file: filePath,
            line: lineNumber,
            message: `[${layerName}] cannot import from [${otherLayerName}] → "${importPath}"`,
          })
        }
      }
    }
  }
}

// ── Check 2: Custom Rules ─────────────────────────────────────
console.log(chalk.blue('🔍 Checking custom rules...'))

for (const rule of rules) {
  if (rule.check === 'directive') {
    // Check "use server" / "use client" directives
    for (const requiredPath of (rule as any).requiredIn ?? []) {
      const files = project.getSourceFiles(`${requiredPath}/**/*.{ts,tsx}`)
      for (const file of files) {
        const text = file.getFullText()
        if (!text.includes(`"${(rule as any).directive}"`) && !text.includes(`'${(rule as any).directive}'`)) {
          violations.push({
            rule: rule.id,
            severity: rule.severity,
            file: file.getFilePath(),
            message: `Missing "${(rule as any).directive}" directive — required in ${requiredPath}`,
          })
        }
      }
    }
  }

  if (rule.check === 'import-pattern') {
    // Check that certain imports only appear in allowed paths
    const allFiles = project.getSourceFiles('src/**/*.{ts,tsx}')
    for (const file of files) {
      const filePath = file.getFilePath().replace(/\\/g, '/')
      const isAllowed = ((rule as any).allowedIn ?? []).some((allowed: string) =>
        filePath.includes(allowed)
      )
      if (isAllowed) continue

      const imports = file.getImportDeclarations()
      for (const imp of imports) {
        if (imp.getModuleSpecifierValue().includes((rule as any).pattern)) {
          violations.push({
            rule: rule.id,
            severity: rule.severity,
            file: file.getFilePath(),
            line: imp.getStartLineNumber(),
            message: `"${(rule as any).pattern}" import not allowed here — only in: ${(rule as any).allowedIn?.join(', ')}`,
          })
        }
      }
    }
  }

  if (rule.check === 'code-pattern') {
    // Check for forbidden code patterns
    for (const forbiddenPath of (rule as any).forbiddenIn ?? []) {
      const files = project.getSourceFiles(`${forbiddenPath}/**/*.{ts,tsx}`)
      for (const file of files) {
        const text = file.getFullText()
        const lines = text.split('\n')
        lines.forEach((line, i) => {
          if (line.includes((rule as any).pattern)) {
            violations.push({
              rule: rule.id,
              severity: rule.severity,
              file: file.getFilePath(),
              line: i + 1,
              message: `Forbidden pattern "${(rule as any).pattern}" found`,
            })
          }
        })
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────
const errors   = violations.filter(v => v.severity === 'error')
const warnings = violations.filter(v => v.severity === 'warning')

if (violations.length === 0) {
  console.log(chalk.green('\n✅ Architecture is clean. No violations found.\n'))
  process.exit(0)
}

if (warnings.length > 0) {
  console.log(chalk.yellow(`\n⚠️  ${warnings.length} warning(s):\n`))
  warnings.forEach(v => {
    console.log(chalk.yellow(`  [${v.rule}] ${v.file}${v.line ? `:${v.line}` : ''}`))
    console.log(chalk.gray(`  → ${v.message}\n`))
  })
}

if (errors.length > 0) {
  console.log(chalk.red(`\n❌ ${errors.length} error(s):\n`))
  errors.forEach(v => {
    console.log(chalk.red(`  [${v.rule}] ${v.file}${v.line ? `:${v.line}` : ''}`))
    console.log(chalk.gray(`  → ${v.message}\n`))
  })
  console.log(chalk.red('Build failed due to architecture violations.\n'))
  process.exit(1)
}

process.exit(0)
```

---

## Step 6 — `scripts/arch-map.ts`

Generates a `CODEBASE.md` — your full codebase map in one readable file.

```ts
// scripts/arch-map.ts
import fs from 'fs'
import path from 'path'
import { stack, layers, dataFlow, rules, aiContext } from '../arch.config'

function walk(dir: string, indent = ''): string {
  if (!fs.existsSync(dir)) return `${indent}(empty)\n`
  let output = ''
  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.') && f !== 'node_modules')
  for (const file of files) {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      output += `${indent}📁 ${file}/\n`
      output += walk(full, indent + '  ')
    } else {
      output += `${indent}📄 ${file}\n`
    }
  }
  return output
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let count = 0
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const full = path.join(dir, file)
    if (fs.statSync(full).isDirectory()) count += countFiles(full)
    else count++
  }
  return count
}

const now = new Date().toISOString()

let md = `# CODEBASE MAP
> Auto-generated by arch-map.ts on ${now}
> Do not edit manually — run \`npm run arch:map\` to regenerate

---

## Stack
${Object.entries(stack).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}

---

## AI Context
${aiContext.summary.trim()}

### Critical Files
${aiContext.criticalFiles.map(f => `- \`${f}\``).join('\n')}

### Do Not Touch
${aiContext.doNotTouch.map(f => `- \`${f}\``).join('\n')}

---

## Architecture Layers

| Layer | Path | Can Import From | Files |
|---|---|---|---|
${Object.entries(layers).map(([name, l]) => 
  `| **${name}** | \`${l.path}\` | ${(l.canImportFrom as readonly string[]).length ? l.canImportFrom.join(', ') : '—'} | ${countFiles(l.path)} |`
).join('\n')}

### Layer Descriptions
${Object.entries(layers).map(([name, l]) => `- **${name}**: ${l.description}`).join('\n')}

---

## Data Flows

${Object.entries(dataFlow).map(([name, flow]) => `### ${name}
${flow.description}

- **Files**: ${flow.files.map(f => `\`${f}\``).join(', ')}
- **Tables**: ${(flow as any).tables?.map((t: string) => `\`${t}\``).join(', ') ?? '—'}
${(flow as any).fields ? `- **Key fields**: ${(flow as any).fields.map((f: string) => `\`${f}\``).join(', ')}` : ''}
`).join('\n')}

---

## Architecture Rules (${rules.length} total)

| ID | Severity | Description |
|---|---|---|
${rules.map(r => `| \`${r.id}\` | ${r.severity === 'error' ? '🔴 error' : '🟡 warning'} | ${r.description} |`).join('\n')}

---

## File Tree

\`\`\`
${walk('src')}
\`\`\`

---

## DB Schema Summary

See \`prisma/schema.prisma\` for full schema.

### Public Tables (your app)
- **profiles** — user profile, \`is_paid\`, \`polar_customer_id\`, \`current_plan\`
- **notes** — user notes with tags, pinning, linked notes
- **note_versions** — version history per note
- **notes_history_snapshots** — full snapshots with mode/trigger
- **feedback**, **bug_reports**, **feature_requests** — user feedback
- **share_actions**, **share_counts** — sharing analytics
- **usage_*** — usage tracking tables

### Auth Tables (Supabase managed — do not modify)
- **users**, **sessions**, **identities**, **refresh_tokens**
- MFA, OAuth, SAML tables
`

fs.mkdirSync('.arch', { recursive: true })
fs.writeFileSync('.arch/CODEBASE.md', md)
console.log('✅ .arch/CODEBASE.md generated')
```

---

## Step 7 — `scripts/arch-scaffold.ts`

Generate files in the right layer following your conventions.

```ts
// scripts/arch-scaffold.ts
// Usage:
//   npx ts-node scripts/arch-scaffold.ts action notes
//   npx ts-node scripts/arch-scaffold.ts hook Notes
//   npx ts-node scripts/arch-scaffold.ts component NoteCard

import fs from 'fs'
import path from 'path'
import { conventions } from '../arch.config'

const [,, type, name] = process.argv

if (!type || !name) {
  console.error('Usage: arch-scaffold.ts <action|hook|component|api> <name>')
  process.exit(1)
}

const templates: Record<string, { path: () => string; content: () => string }> = {
  action: {
    path: () => conventions.serverAction(name),
    content: () => `'use server'
import { prisma } from '@/lib/db'
import type { ActionResult } from '@/types'

export async function get${capitalize(name)}(): Promise<ActionResult<any>> {
  try {
    // TODO: implement
    return { success: true, data: null }
  } catch (error) {
    return { success: false, error: 'Failed to get ${name}' }
  }
}
`,
  },
  hook: {
    path: () => conventions.hook(name),
    content: () => `'use client'
import { useState, useEffect } from 'react'
import type { ActionResult } from '@/types'

export function use${capitalize(name)}() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // TODO: implement
  }, [])

  return { data, loading, error }
}
`,
  },
  component: {
    path: () => conventions.component(name),
    content: () => `import type { FC } from 'react'

type ${name}Props = {
  // TODO: define props
}

export const ${name}: FC<${name}Props> = ({}) => {
  return (
    <div>
      {/* TODO: implement ${name} */}
    </div>
  )
}
`,
  },
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const template = templates[type]
if (!template) {
  console.error(`Unknown type: ${type}. Use: action, hook, component`)
  process.exit(1)
}

const filePath = template.path()
const content = template.content()

fs.mkdirSync(path.dirname(filePath), { recursive: true })

if (fs.existsSync(filePath)) {
  console.error(`File already exists: ${filePath}`)
  process.exit(1)
}

fs.writeFileSync(filePath, content)
console.log(`✅ Created ${filePath}`)
```

---

## Step 8 — `package.json` Scripts

```json
{
  "scripts": {
    "dev":        "next dev",
    "build":      "npm run arch:check && next build",
    "arch:check": "ts-node --project tsconfig.json scripts/arch-check.ts",
    "arch:map":   "ts-node --project tsconfig.json scripts/arch-map.ts",
    "arch:new":   "ts-node --project tsconfig.json scripts/arch-scaffold.ts",
    "db:push":    "prisma db push",
    "db:pull":    "prisma db pull",
    "db:studio":  "prisma studio",
    "db:gen":     "prisma generate"
  }
}
```

---

## Step 9 — `tsconfig.json` Paths

Make sure your absolute imports work:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Daily Workflow

```bash
# Check architecture (runs automatically before build)
npm run arch:check

# Generate codebase map (paste into AI for instant context)
npm run arch:map

# Scaffold a new server action
npm run arch:new action payments

# Scaffold a new hook
npm run arch:new hook Profile

# Scaffold a new component
npm run arch:new component NoteCard

# Push DB changes
npm run db:push

# Open DB browser
npm run db:studio
```

---

## How to Use With AI (Claude, Cursor, etc.)

When starting a new chat, paste these two files:

1. `arch.config.ts` — the AI now knows your full architecture
2. `prisma/schema.prisma` — the AI now knows your full DB

That's it. No need to explain your stack, your patterns, your rules.
The AI can immediately answer questions like:

- "Where should I put the logic for checking if a user is paid?"
- "What tables are involved in the payment flow?"
- "Can a hook import from actions?"

---

## What You've Built

| Problem | Solution |
| --- | --- |
| "Where does this logic go?" | Layer rules in `arch.config.ts` |
| "Build passes but architecture is broken" | `arch:check` runs before every build |
| "New dev doesn't know the codebase" | `arch:map` generates full map in seconds |
| "AI doesn't understand my project" | Paste `arch.config.ts` — instant context |
| "Inconsistent file naming" | `arch:new` scaffolds with conventions |
| "I forget my data flows" | `dataFlow` section documents it all |

This is a compiler for your architecture. It fails builds on violations.
It generates documentation. It scaffolds new files. It gives AI full context.
All from one file — exactly like Prisma does for your database.
