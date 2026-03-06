# Great question — and good rebrand. Let me think through this properly

Imports/exports are the **foundation** but they're not the whole picture. Here's the complete map of what a real architecture enforcer can analyze:

## What imports/exports cover

Imports give you **dependency direction** — the most important architectural signal. If `components` imports from `actions`, that's a layer violation. This catches ~70% of real architecture problems.

Exports give you **surface area** — what a module exposes to the world. You can enforce that `actions` only exports `async` functions, that `types` only exports `type`/`interface`, that `lib/db.ts` only exports `prisma`.

## What they don't cover — and what else matters

**File structure** — a file in the wrong folder is an architectural violation before you even look at imports. `db.ts` sitting in `src/components/` is wrong regardless of what it imports.

**Directive enforcement** — `'use server'` / `'use client'` aren't imports or exports. They're declarations that determine the entire execution context. Getting these wrong breaks Next.js silently in ways imports can't detect.

**Export shape** — an `actions` file that exports a plain object instead of async functions violates the architecture even if imports are clean. An `index.ts` in `types/` that exports logic instead of just types is wrong.

**Naming** — a hook file called `fetchNotes.ts` instead of `useNotes.ts` is an architectural violation. A server action file with a capital letter is wrong. These are invisible to import analysis.

**Barrel exports** — `index.ts` files that re-export everything from a layer can create hidden coupling. You may want to forbid or require them per layer.

**Dead exports** — things exported but never imported anywhere are architectural debt. Especially in `types/` — unused types signal stale abstractions.

**Circular imports** — `A` imports `B` imports `A`. Import direction alone doesn't catch this — you need graph analysis.

**Cross-boundary type leakage** — a component that doesn't import Prisma directly but accepts a `Prisma.Note` as a prop has leaked the DB type through. The import is clean; the architecture is broken.

**Async boundaries** — in Next.js, `async` components must be server components. A `'use client'` file with `async` component functions is a violation that imports can't see.

**Environment leakage** — `process.env.DATABASE_URL` appearing in a client component will silently be `undefined` at runtime. Not an import issue — a pattern issue.

---

## The complete set of signals `arc` should analyze

| Signal | What it catches | How to detect |
| --- | --- | --- |
| Import statements | Layer boundary violations, forbidden modules | Parse `from '...'` lines |
| Export statements | Wrong export shapes per layer | Parse `export` keywords |
| File location | Files in wrong layer | Path matching |
| Directives | `'use server'`/`'use client'` presence | First-line scan |
| File naming | Convention violations | Regex on filename |
| Circular deps | Import cycles | Build import graph, detect cycles |
| Code patterns | `console.log`, `: any`, hardcoded values | Substring/regex scan |
| Export types | `types/` exporting functions, `actions/` exporting non-async | AST analysis |
| Barrel files | Unwanted or missing `index.ts` | File existence check |
| Dead exports | Exported but never imported | Cross-file reference counting |
| Env access | `process.env` in wrong layers | Pattern scan |

---

## What this means for `arc`'s `.arc` DSL

The current DSL handles imports and patterns. To cover everything, it needs a few more declarations:

```md
# Current (import + pattern)
rule "no-prisma-in-components" {
  forbid import "@prisma/client"
  except in [lib, actions]
}

# New: export shape enforcement
layer types {
  path       "src/types"
  allow exports [type, interface, enum]   ← only types allowed out
  forbid exports [function, class, const] ← no logic
}

layer actions {
  path       "src/actions"
  require exports async-function         ← all exports must be async functions
}

# New: naming conventions enforced (not just documented)
layer hooks {
  path        "src/hooks"
  require filename "use*.ts"             ← enforced, not just convention
}

# New: circular dependency detection
enforce no-circular-imports              ← global flag

# New: environment variable access
rule "no-env-in-client" {
  forbid pattern "process.env"
  in layers [components, hooks, ui]
}

# New: dead export detection  
enforce no-dead-exports                  ← warn on exported but never imported symbols
```

---

## Updated spec additions for the build doc

Want me to generate an updated `ARC_BUILD_SPEC.md` that incorporates all of this — the full signal set, the extended DSL syntax for export shape + naming enforcement + circular detection + env rules, and the `arc` rebrand throughout?
