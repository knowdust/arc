# arc — Architecture Compiler for Codebases

> A single source of truth for your codebase architecture — like `schema.prisma` but for layers, rules, and flows.

**arc** is a zero-dependency architecture compiler that enforces codebase rules at build time.

```md
schema.prisma    → single source of truth for your DB
.arc             → single source of truth for your architecture
```

When `npm run build` runs, your architecture is **validated like types are validated**.
If you violate a rule, the build fails with a clear error — just like a TypeScript error.

---

## Features

- ✅ **Layered Architecture Enforcement** — Define layers and what they can import
- ✅ **Export Shape Validation** — Enforce what types of exports each layer can have
- ✅ **Filename Conventions** — Require specific naming patterns per layer
- ✅ **Circular Import Detection** — Find and prevent import cycles
- ✅ **Dead Export Detection** — Identify exported symbols that are never used
- ✅ **Custom Rules** — Forbid imports, packages, or code patterns with error/warning severity
- ✅ **Data Flow Documentation** — Document how data moves through your app
- ✅ **Auto-Generated Maps** — Generate `.arc-output/CODEBASE.md` from your .arc file
- ✅ **File Scaffolding** — Generate new files following your conventions
- ✅ **Zero Dependencies** — Pure Node.js, works anywhere
- ✅ **AI-Readable Context** — Paste `.arc` into Claude/Cursor for instant understanding

---

## Quick Start

### 1. Install

Copy the `arc-cli/` folder into your project root.

### 2. Create `.arc` file

```arc
# .arc — Architecture definition

arc "my-app" {
  name:    "Feature Based Architecture"
  version  "1.0.0"
  stack    ["nextjs", "typescript", "prisma", "supabase"]
  language typescript
}

# Enable advanced analysis
enforce no-circular-imports
enforce no-dead-exports

layer types {
  path        "src/types"
  description "TypeScript type definitions"
  can import  []
  allow exports [type, interface, enum]   # Only types allowed
}

layer lib {
  path        "src/lib"
  description "Infrastructure code"
  can import  [types]
}

layer actions {
  path        "src/actions"
  description "Server actions — all DB access lives here"
  can import  [types, lib]
  require directive "use server"
  require exports [async-function]        # All exports must be async
}

layer hooks {
  path        "src/hooks"
  description "React hooks"
  can import  [types, lib]
  require directive "use client"
  require filename "use*.ts"              # Enforce naming convention
}

layer components {
  path        "src/components"
  description "React components"
  can import  [types, hooks, lib]
}

rule "no-prisma-in-components" {
  severity    error
  description "Components cannot import Prisma directly"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

rule "no-lodash" {
  severity    warning
  description "Use native JS instead"
  forbid package "lodash"
  except in   []
}

rule "no-console-logs" {
  severity    warning
  description "Remove console.log before shipping"
  forbid pattern "console.log"
  in layers   [components, actions]
}
```

### 3. Add to `package.json`

```json
{
  "scripts": {
    "build": "arc check && next build",
    "arc:check": "node arc/arc-cli/arc.js check",
    "arc:map": "node arc/arc-cli/arc.js map",
    "arc:context": "node arc/arc-cli/arc.js context",
    "arc:print": "node arc/arc-cli/arc.js print",
    "arc:generate": "node arc/arc-cli/arc.js generate",
    "arc:sync": "pnpm arc:check && pnpm arc:map && pnpm arc:context"
  }
}
```

### 4. Run

```bash
npm run arc:generate  # Auto-generate from package.json
npm run arc:check     # Validate architecture
npm run arc:map       # Generate .arc-output/CODEBASE.md
npm run arc:context   # Generate .arc-output/LLM_CONTEXT.md
npm run arc:print     # Pretty-print your architecture
npm run arc:sync      # Check + map + context in one command
npm run build         # Now fails on violations!
```

---

## Commands

### `arc check`

Validates your codebase against `.arc` rules.

```md
◆ arc check

  Parsed project.arc — 7 layers, 5 rules

  ✗  2 errors:

  src/components/app/NoteList.tsx:1
  └─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

  src/hooks/useNotes.ts
  └─ [missing-directive] Missing "use client" — required in [hooks] layer

  Architecture check failed.
```

- Exit code `0` if clean or only warnings
- Exit code `1` if any errors

### `arc map`

Generates `.arc-output/CODEBASE.md` with:

- Layer structure and import graph
- File counts per layer
- All rules and flows
- File tree of `src/`

Perfect for onboarding or AI context.

### `arc context`

Generates `.arc-output/LLM_CONTEXT.md` with:

- AI instruction preamble
- Layer rules and architecture boundaries
- Enforcements and custom rules
- Feature inventory from `features {}`
- Flows, conventions, and critical files

Use this file as upload/paste context for Copilot, Claude, Cursor, or GPT.

### `arc print`

Pretty-prints your parsed `.arc` file:

```md
◆ arc print

  my-app v1.0.0
  nextjs + typescript + prisma

  Layers (4)
  types             src/types
                    imports: none
  lib               src/lib
                    imports: types
  actions           src/actions
                    imports: types, lib  |  requires: "use server"
  components        src/components
                    imports: types, lib

  Rules (2)
  error    no-prisma-in-components
           Components cannot import Prisma directly
  warning  no-console-logs
           Remove console.log before shipping
```

### `arc scaffold <type> <name>`

Generates new files following your conventions:

```bash
arc scaffold action payments
# → Creates src/actions/payments.ts with 'use server'

arc scaffold hook Notes
# → Creates src/hooks/useNotes.ts with 'use client'

arc scaffold component NoteCard
# → Creates src/components/app/NoteCard.tsx
```

---

## The `.arc` Language

Complete DSL reference with all features:

```arc
# ── Project Declaration ────────────────────────────

arc "project-name" {
  name:    "Architecture Style Name"    # optional
  version  "1.0.0"
  stack    ["nextjs", "typescript", "prisma"]  # array syntax (new)
  # or: stack nextjs + typescript + prisma       # plus syntax (backward compatible)
  language typescript
}

# ── Global Enforcement Flags ───────────────────────

enforce no-circular-imports      # Detect import cycles
enforce no-dead-exports          # Find unused exports
enforce no-implicit-any          # TypeScript: no implicit any
enforce no-floating-promises     # Async calls without await/catch

# ── Layers ─────────────────────────────────────────

layer <name> {
  path        "<relative-path>"
  description "<string>"
  can import  [<layer-name>, ...]
  
  # Directive enforcement
  require directive "<string>"       # e.g. "use server"
  
  # Filename conventions
  require filename "<pattern>"       # e.g. "use*.ts"
  
  # Export shape enforcement (NEW)
  require exports [<type>, ...]      # All exports must be these types
  allow exports   [<type>, ...]      # Only these export types allowed
  forbid exports  [<type>, ...]     # These export types forbidden
  
  readonly                           # Don't modify in arc scaffold
}

# Export types: async-function, type, interface, enum, named, default, 
#               function, class, const

# ── Rules ──────────────────────────────────────────

rule "<id>" {
  severity    error | warning
  description "<string>"
  
  # Option 1: Forbid imports
  forbid import "<module>"
  except in   [<layer>, ...]
  
  # Option 2: Forbid packages (NEW)
  forbid package "<package-name>"
  except in   [<layer>, ...]
  
  # Option 3: Forbid code patterns
  forbid pattern "<text>"
  in layers   [<layer>, ...]
}

# ── Data Flows ─────────────────────────────────────

flow <name> {
  description "<string>"
  steps   ["<step>", ...]
  touches ["<file>", ...]
  tables  ["<table>", ...]
  fields  ["<field>", ...]
}

# ── Conventions ────────────────────────────────────

convention <name> "<pattern-with-{placeholders}>"

# Tokens: {Name} PascalCase, {domain} camelCase, {name} any case

# ── AI Context ─────────────────────────────────────

context {
  summary """
    Multi-line summary of your app.
  """
  critical-files ["<path>", ...]
  do-not-touch   ["<path>", ...]
}
```

---

## Why arc?

**Before arc:**

- Architecture rules live in your head or in docs
- Violations caught in code review (too late)
- New devs break patterns accidentally
- No single source of truth

**After arc:**

- Architecture is in code (`.arc`)
- Violations caught at build time (like type errors)
- CI fails on violations automatically
- Paste `.arc` into AI for instant context

---

## How It Works

```md
.arc (DSL file)
     │
     ▼
  Lexer    → tokens
     │
     ▼
  Parser   → AST
     │
     ├─────────────────────────┐
     ▼                         ▼
  Checker (7 passes)       Mapper
     │                         │
     ├─ Import boundaries      ▼
     ├─ Directives        CODEBASE.md
     ├─ Filename patterns
     ├─ Custom rules
     ├─ Export shapes
     ├─ Circular imports
     └─ Dead exports
     │
     ▼
Violations
```

**7 Analysis Passes:**

1. **Import Boundaries** — Layer A can only import from allowed layers
2. **Directives** — `'use server'`/`'use client'` presence validation
3. **Filename Conventions** — Pattern matching against required formats
4. **Custom Rules** — Forbidden imports, packages, and code patterns
5. **Export Shapes** — Validate export types per layer
6. **Circular Imports** — Graph-based cycle detection
7. **Dead Exports** — Symbols exported but never imported

Zero npm dependencies. Pure Node.js built-ins.

---

## Backward Compatibility

Arc maintains full backward compatibility with previous versions:

### Legacy Syntax Support

✅ **Old stack syntax** still works:

```arc
stack nextjs + typescript + prisma  # still valid
```

✅ **Old file references** supported:

- Both `.arc` and `project.arc` filenames detected
- Parser gracefully handles missing new fields

✅ **Old layer syntax** works fine:

```arc
layer actions {
  path "src/actions"
  can import [types, lib]
  require directive "use server"  # no need for new features
}
```

### Migration Path

To adopt new features incrementally:

1. **Start simple** — Use basic layers and rules
2. **Add enforcement flags** — `enforce no-circular-imports` when ready
3. **Add export rules** — `require exports [async-function]` for specific layers
4. **Add filename rules** — `require filename "use*.ts"` for conventions

No breaking changes. Update at your own pace.

---

## Integration with AI

Paste `.arc` into Claude, Cursor, or Copilot chat:

> "Here's my .arc file. Please help me implement the payment flow."

The AI instantly understands:

- Your full layer structure
- What can import what
- Export requirements per layer
- Filename conventions
- Your data flows
- Your tech stack
- What files to never touch

No need to explain your codebase every session.

---

## Tech Stack

**Made for:**

- Next.js 14 App Router
- TypeScript
- Prisma ORM
- Supabase (Postgres + Auth)
- Polar.sh (payments)
- shadcn/ui + Tailwind

**Works with:**

- Any JavaScript/TypeScript codebase
- Any Node.js-based project

---

## Requirements

- Node.js ≥ 18.0.0
- No npm dependencies

---

## License

MIT

---

## Learn More

- See `arc.md` for the full build specification
- See `project.arc` for a complete example
- Check `arc-vscode/` for VS Code syntax highlighting

---

**arc** — like Prisma for your architecture.
