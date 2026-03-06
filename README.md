# arc

**Architecture compiler for JavaScript and TypeScript codebases.**

Define your architecture once in `.arc`. Enforce it on every build. Give your entire codebase to any LLM in one file.

```text
arc check      → fails the build on architecture violations
arc map        → generates a full codebase map
arc context    → generates an LLM-ready context file
arc scaffold   → creates files following your conventions
arc init       → starts from a built-in template
```

Zero dependencies. Pure Node.js. Works anywhere Node ≥ 18 runs.

---

## The idea

`prisma/schema.prisma` is your single source of truth for the database.
`.arc` is your single source of truth for your architecture.

```text
#.arc

arc "my-app" {
  version  "1.0.0"
  stack    nextjs + supabase + prisma + tailwind
  language typescript
}

layer types {
  path       "src/types"
  can import []
}

layer actions {
  path       "src/actions"
  can import [types, lib]
  require directive "use server"
}

layer components {
  path       "src/components"
  can import [types, hooks]
}

rule "no-prisma-in-components" {
  severity    error
  description "Components must not import Prisma — use server actions"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

enforce no-circular-imports
```

Then:

```bash
arc check
# ✗  src/components/app/NoteList.tsx:2
# └─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"
```

Your build fails. The violation is caught. Architecture is enforced.

---

## Why arc exists

Every JS/TS project has the same problems:

- **"Where does this code go?"** — answered differently by every developer
- **"Don't import Prisma in components"** — said in every code review
- **"The new dev broke the architecture"** — caught after the fact
- **"The LLM doesn't know our patterns"** — explained from scratch every session

Arc solves all of them with one file.

---

## Installation

### Option 1 — Copy into your project (recommended)

```bash
# Clone arc into your project
git clone https://github.com/your-username/arc arc-cli
cd arc-cli && rm -rf .git

# Add to package.json
```

```json
{
  "scripts": {
    "build":       "node arc-cli/arc.js check && next build",
    "arc:check":   "node arc-cli/arc.js check",
    "arc:map":     "node arc-cli/arc.js map",
    "arc:context": "node arc-cli/arc.js context",
    "arc:print":   "node arc-cli/arc.js print",
    "arc:scaffold":"node arc-cli/arc.js scaffold"
  }
}
```

### Option 2 — Global install

```bash
npm install -g arc-cli
arc help
```

---

## Getting started

### 1. Initialize from a template

```bash
arc init nextjs
# → creates .arc with Next.js App Router architecture
```

Available templates:

- `vanilla` — Pure HTML + CSS + JavaScript
- `react-spa` — React + Vite + TypeScript
- `nextjs` — Next.js App Router + TypeScript
- `express-api` — Node.js + Express + TypeScript
- `cli` — CLI Tool (Node.js + TypeScript)
- `extension` — Browser Extension (TypeScript)

### 2. Edit `.arc` to match your codebase

```text
arc "my-app" {
  version  "1.0.0"
  stack    nextjs + supabase + prisma
  language typescript
}

layer types {
  path        "src/types"
  description "TypeScript types only."
  can import  []
}

layer actions {
  path        "src/actions"
  description "Server actions. All DB access here."
  can import  [types, lib]
  require directive "use server"
}

# ... more layers, rules, flows, features
```

### 3. Run your first check

```bash
arc check
```

### 4. Add to your build

```json
"build": "arc check && next build"
```

Now architecture violations fail the build — exactly like TypeScript fails on type errors.

---

## The `.arc` DSL

### Layers

Layers are the building blocks of your architecture. Each layer has a path and defines exactly what it can import from.

```text
layer hooks {
  path        "src/hooks"
  description "React hooks. Client-side only."
  can import  [types, lib]
  require directive "use client"
  require filename  "use*.ts"
}
```

### Rules

Rules enforce specific patterns across your codebase.

```text
rule "no-process-env-scatter" {
  severity    error
  description "All env vars through src/config only"
  forbid pattern "process.env."
  in layers   [actions, components, hooks]
}
```

### Global enforcement

Global checks that run across the entire codebase.

```text
enforce no-circular-imports
enforce no-dead-exports
```

### Features

Document what's already built. Tell your LLM what exists so it doesn't rebuild it.

```text
features {
  feature "auth" {
    description "Google OAuth via Supabase."
    status      built
    actions     ["signIn", "signOut", "getSession"]
    tables      ["auth.users", "public.profiles"]
  }

  feature "dark-mode" {
    description "System-aware dark/light theme toggle."
    status      planned
  }
}
```

### Context

AI-readable summary of your entire project.

```text
context {
  summary """
    Next.js note-taking app. Auth via Supabase.
    Payments via Polar.sh. DB access only via Prisma in src/actions.
  """
  critical-files ["src/types/index.ts", "src/lib/db.ts"]
  do-not-touch   ["src/components/ui/"]
}
```

---

## Commands

### `arc check`

Validates your codebase against `project.arc`. Runs 7 analysis passes:

1. **Import boundaries** — layer A can only import from allowed layers
2. **Required directives** — `'use server'`, `'use client'` where required
3. **Filename conventions** — `use*.ts` in hooks, etc.
4. **Custom rules** — forbidden imports, patterns, packages
5. **Export shapes** — `types/` exports only types, `actions/` exports only async functions
6. **Circular imports** — detects A→B→A cycles
7. **Dead exports** — exported symbols never imported anywhere

```bash
arc check

◆ arc check

  Parsed project.arc — 7 layers, 6 rules, 2 enforcements

  ✗  2 errors:

  src/components/app/NoteList.tsx:1
  └─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

  src/hooks/fetchNotes.ts
  └─ [filename-convention] "fetchNotes.ts" does not match required pattern "use*.ts" in [hooks]

  Architecture check failed. 2 errors.
```

Exit code `0` = clean or warnings only. Exit code `1` = errors found.

### `arc map`

Generates `.arc/CODEBASE.md` — a complete map of your codebase for humans.

```bash
arc map
# → .arc/CODEBASE.md
```

### `arc context`

Generates `.arc/LLM_CONTEXT.md` — upload this to any LLM (Claude, Cursor, Copilot) for instant full codebase understanding.

```bash
arc context
# → .arc/LLM_CONTEXT.md (4-8kb, fits any context window)
```

**With AI:** paste `LLM_CONTEXT.md` before your prompt. The LLM knows your layers, rules, features, flows, and conventions — no explanation needed. Everything it writes is validated by `arc check`.

### `arc print`

Pretty-prints your parsed architecture to the terminal.

```bash
arc print
```

### `arc scaffold`

Creates new files following your declared conventions.

```bash
arc scaffold action payments
# → src/actions/payments.ts (with 'use server' template)

arc scaffold hook Profile
# → src/hooks/useProfile.ts (with 'use client' template)

arc scaffold component NoteCard
# → src/components/app/NoteCard.tsx
```

### `arc init`

Creates `project.arc` from a built-in template.

```bash
arc init nextjs
arc init express-api
arc init react-spa
```

---

## VS Code Extension

Syntax highlighting for `.arc` files.

**Install from marketplace:**

```text
ext install arc-language
```

**Or install manually:**

```bash
cd arc-vscode
npx vsce package
code --install-extension arc-language-1.0.0.vsix
```

Provides: keyword highlighting, string coloring, comment support, bracket matching, auto-indent.

---

## Using with AI

The most powerful workflow:

```bash
# 1. Generate LLM context
arc context

# 2. Start AI session — paste LLM_CONTEXT.md contents
# "Here is my codebase context: [paste]
#  Add a note export feature."

# 3. LLM writes code following your architecture

# 4. Validate
arc check
# If violations → paste output back to LLM → it self-corrects
```

The LLM knows:

- Every layer and what it can import
- Every rule and what's forbidden
- Every feature that already exists (won't rebuild them)
- Your naming conventions
- Your data flows
- What files are critical and what not to touch

---

## Full DSL reference

### Blocks

| Block | Purpose |
| --- | --- |
| `arc` | Project name, version, stack |
| `layer` | Path, import rules, constraints |
| `rule` | Forbidden imports, patterns, packages |
| `enforce` | Global flags |
| `flow` | Data flow documentation |
| `features` | Feature inventory |
| `convention` | File naming patterns |
| `context` | AI-readable summary |

### Layer fields

| Field | Required | Description |
| --- | --- | --- |
| `path` | Yes | Relative path to layer root |
| `description` | No | Human/AI description |
| `can import` | Yes | List of layer names this layer can import from |
| `require directive` | No | Required first-line directive |
| `require filename` | No | Glob pattern all filenames must match |
| `require exports` | No | Required export type (`async-function`, `type`, etc.) |
| `allow exports` | No | Whitelist of allowed export types |
| `forbid exports` | No | Blacklist of forbidden export types |
| `readonly` | No | Layer must not be modified by `arc scaffold` |

### Rule fields

| Field | Required | Description |
| --- | --- | --- |
| `severity` | Yes | `error` or `warning` |
| `description` | Yes | Human-readable explanation |
| `forbid import` | One of | Forbidden import path (partial match) |
| `forbid pattern` | One of | Forbidden code substring |
| `forbid package` | One of | Forbidden npm package name |
| `except in` | No | Layer names excluded from import/package rules |
| `in layers` | No | Layer names to check pattern in |

### Enforce flags

| Flag | What it detects |
| --- | --- |
| `no-circular-imports` | Import cycles across the entire codebase |
| `no-dead-exports` | Exported symbols never imported anywhere |
| `no-implicit-any` | TypeScript parameters without explicit types |
| `no-floating-promises` | Async calls without `await` or `.catch()` |

### Feature fields

| Field | Description |
| --- | --- |
| `description` | What the feature does |
| `status` | `built`, `in-progress`, or `planned` |
| `files` | Key files for this feature |
| `actions` | Server action function names |
| `hooks` | Hook names |
| `components` | Component names |
| `routes` | URL routes |
| `tables` | Database tables used |
| `depends-on` | Other feature names this depends on |
| `notes` | Extra notes for the LLM |

---

## Project structure

```text
arc-cli/
├── arc.js                  CLI entry point
├── lexer.js                Tokenizer
├── parser.js               AST builder
├── checker.js              7-pass rule enforcer
├── mapper.js               CODEBASE.md generator
├── context-generator.js    LLM_CONTEXT.md generator
├── scaffold.js             File generator
├── graph.js                Circular import detector
├── templates.js            Built-in project.arc presets
└── package.json

arc-vscode/
├── package.json
├── language-configuration.json
└── syntaxes/arc.tmLanguage.json
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

The most valuable contributions right now:

- New `project.arc` templates for different stacks
- Bug reports with minimal reproductions
- VS Code extension improvements

---

## License

MIT — see [LICENSE](LICENSE).

---

## Status

Early release. The DSL is stable. The compiler is working. The VS Code extension is functional.

Breaking changes to the `.arc` DSL format will always be a major version bump.
Unknown keywords are always silently skipped — old `.arc` files always parse in new versions.

---

*arc is to architecture what Prisma is to databases.*
