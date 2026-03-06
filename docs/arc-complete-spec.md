# ARC — Complete Build Specification

## Architecture Compiler + `.arc` DSL + VS Code Highlighter

> **This document is a complete build spec for GitHub Copilot / AI coding agents.**
> Read every section before writing a single line of code.
> Every decision is made here. The agent implements — it does not design.
> Do not add features not listed. Do not change names. Follow implementation order exactly.

---

## Table of Contents

1. [What You Are Building](#1-what-you-are-building)
2. [Repository Structure](#2-repository-structure)
3. [The `.arc` DSL — Full Language Spec](#3-the-arc-dsl--full-language-spec)
4. [Compiler Pipeline — All Analysis Passes](#4-compiler-pipeline--all-analysis-passes)
5. [CLI Tool — Full Spec](#5-cli-tool--full-spec)
6. [VS Code Extension — Syntax Highlighter](#6-vs-code-extension--syntax-highlighter)
7. [Built-in Architecture Templates](#7-built-in-architecture-templates)
8. [The `project.arc` File for This Codebase](#8-the-projectarc-file-for-this-codebase)
9. [Integration into Next.js App](#9-integration-into-nextjs-app)
10. [Implementation Order](#10-implementation-order)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. What You Are Building

Three things that work together:

```md
project.arc           ← the DSL file (human writes this once)
      │
      ▼
arc CLI               ← compiler (lexer → parser → 7 analysis passes)
  arc check           ← enforces all rules, exits 1 on any error
  arc map             ← generates .arc/CODEBASE.md
  arc print           ← pretty-prints parsed architecture
  arc scaffold        ← generates files following conventions
  arc init            ← creates project.arc from a built-in template
      │
      ▼
VS Code Extension     ← syntax highlighting for .arc files
```

**The mental model:**

- `prisma/schema.prisma` = single source of truth for the **database**
- `project.arc` = single source of truth for the **architecture**
- `arc check` is to architecture what `tsc` is to types — fails the build on violations
- The VS Code extension makes `project.arc` as pleasant to write as `schema.prisma`

**Zero npm dependencies.** The CLI runs on any machine with Node ≥ 18.
Only Node built-ins: `fs`, `path`, `readline`.

---

## 2. Repository Structure

```md
arc-cli/
├── arc.js                         ← CLI entry point (#!/usr/bin/env node)
├── lexer.js                       ← tokenizer
├── parser.js                      ← AST builder
├── checker.js                     ← all rule enforcement (7 passes)
├── mapper.js                      ← CODEBASE.md generator
├── scaffold.js                    ← file generator
├── graph.js                       ← import graph builder (for circular detection)
├── templates.js                   ← built-in project.arc presets
├── package.json
└── README.md

arc-vscode/
├── package.json                   ← extension manifest
├── language-configuration.json    ← bracket matching, comments
├── syntaxes/
│   └── arc.tmLanguage.json        ← TextMate grammar
└── README.md
```

---

## 3. The `.arc` DSL — Full Language Spec

### 3.1 Overview

The `.arc` file is a custom DSL. It is **not** JSON, YAML, or TOML.
Block-based, expressive, readable. Inspired by Prisma schema language.

| Property | Value |
| --- | --- |
| File extension | `.arc` |
| Conventional filename | `project.arc` (project root) |
| Encoding | UTF-8 |
| Line comments | `#` |
| Multiline strings | `"""..."""` |

### 3.2 Complete Syntax — All Block Types

```md
# ── Project declaration ───────────────────────────────────────

arc "<name>" {
  version  "<semver>"
  stack    <id> + <id> + ...
  language typescript | javascript
}

# ── Layer declaration ─────────────────────────────────────────

layer <name> {
  path            "<relative-path>"
  description     "<string>"
  can import      [<layer-name>, ...]

  # Optional constraints:
  require directive "<string>"          # 'use server' | 'use client'
  require filename  "<glob>"            # e.g. "use*.ts", "*Service.ts"
  require exports   <export-type>       # async-function | type | interface | named | default
  allow exports     [type, interface, enum]
  forbid exports    [function, class, const]
  readonly                              # layer must not be modified by arc scaffold
}

# ── Rule declaration ──────────────────────────────────────────

rule "<id>" {
  severity    error | warning
  description "<string>"

  # One of:
  forbid import   "<module-string>"     # exact or partial match on import path
  forbid pattern  "<string>"            # substring match on any non-comment line
  forbid package  "<package-name>"      # node_modules package name

  # Scope:
  except in   [<layer-name>, ...]       # used with forbid import / forbid package
  in layers   [<layer-name>, ...]       # used with forbid pattern
}

# ── Global enforce flags ──────────────────────────────────────

enforce no-circular-imports             # detect import cycles across all layers
enforce no-dead-exports                 # exported symbols never imported anywhere
enforce no-implicit-any                 # TypeScript implicit any parameters
enforce no-floating-promises            # async calls without await or .catch

# ── Flow declaration (documentation, not enforced) ────────────

flow <name> {
  description "<string>"
  steps   ["<string>", ...]
  touches ["<path>", ...]
  tables  ["<table>", ...]             # optional
  fields  ["<field>", ...]             # optional
}

# ── Naming convention declaration ────────────────────────────

convention <name> "<pattern>"          # {Name} and {domain} are interpolation tokens

# ── Context block (AI-readable summary) ──────────────────────

context {
  summary """
    <multiline>
  """
  critical-files ["<path>", ...]
  do-not-touch   ["<path>", ...]
}
```

### 3.3 Token Types

| Token | Description | Examples |
| --- | --- | --- |
| `KEYWORD` | Reserved words (full list below) | `arc`, `layer`, `rule`, `enforce` |
| `STRING` | Double-quoted single-line | `"src/actions"` |
| `MULTILINE_STRING` | Triple-double-quoted | `"""..."""` |
| `IDENTIFIER` | Unquoted word | `nextjs`, `notes`, `auth-flow` |
| `LBRACE` | `{` | |
| `RBRACE` | `}` | |
| `LBRACKET` | `[` | |
| `RBRACKET` | `]` | |
| `PLUS` | `+` | stack declarations |
| `EOF` | End of file | |

**Complete keyword list:**

```md
arc, layer, rule, flow, convention, context, enforce,
version, stack, language,
path, description, can, import, require, allow, forbid,
directive, filename, exports, readonly,
severity, pattern, package, except, in, layers,
steps, touches, tables, fields,
summary, critical-files, do-not-touch,
error, warning,
async-function, type, interface, named, default, enum, function, class, const,
no-circular-imports, no-dead-exports, no-implicit-any, no-floating-promises
```

### 3.4 Complete AST Shape

```javascript
{
  project: {
    name:     string,
    version:  string,
    stack:    string[],
    language: "typescript" | "javascript",
  } | null,

  layers: [{
    name:           string,
    path:           string,
    description:    string,
    canImport:      string[],          // layer names
    directive:      string | null,     // 'use server' | 'use client'
    requireFilename: string | null,    // glob pattern e.g. "use*.ts"
    requireExports: string | null,     // 'async-function' | 'type' etc
    allowExports:   string[],          // ['type', 'interface', 'enum']
    forbidExports:  string[],          // ['function', 'class', 'const']
    readonly:       boolean,
  }],

  rules: [{
    id:          string,
    severity:    "error" | "warning",
    description: string,
    forbidType:  "import" | "pattern" | "package",
    forbidValue: string,
    exceptIn:    string[],
    inLayers:    string[],
  }],

  enforcements: {
    noCircularImports:   boolean,
    noDeadExports:       boolean,
    noImplicitAny:       boolean,
    noFloatingPromises:  boolean,
  },

  flows: [{
    name:        string,
    description: string,
    steps:       string[],
    touches:     string[],
    tables:      string[],
    fields:      string[],
  }],

  conventions: [{
    name:    string,
    pattern: string,
  }],

  context: {
    summary:       string,
    criticalFiles: string[],
    doNotTouch:    string[],
  } | null,
}
```

### 3.5 Parsing Rules

- Blocks can appear in any order in the file
- Multiple `layer`, `rule`, `flow`, `convention` blocks allowed
- Only one `arc` block and one `context` block per file
- `enforce` declarations appear at top level (not inside blocks)
- Unknown keywords inside blocks: skip silently (forward compatibility)
- Parse errors must include line number and the offending token value
- Empty lists `[]` are valid everywhere

### 3.6 Export Type Values

When used in `require exports`, `allow exports`, `forbid exports`:

| Value | Meaning |
| --- | --- |
| `async-function` | Only `export async function` declarations |
| `type` | Only `export type` declarations |
| `interface` | Only `export interface` declarations |
| `enum` | Only `export enum` declarations |
| `named` | Any named export (`export const`, `export function`, etc.) |
| `default` | Only default exports |
| `function` | Any `export function` (sync or async) |
| `class` | Any `export class` |
| `const` | Any `export const` |

---

## 4. Compiler Pipeline — All Analysis Passes

```md
project.arc (raw text)
       │
       ▼
  ┌─────────┐
  │  lexer  │  source string → Token[]
  └─────────┘
       │
       ▼
  ┌─────────┐
  │ parser  │  Token[] → ArchAST
  └─────────┘
       │
       ├──────────────────── arc check ──────────────────────────────┐
       │                                                              │
       ▼                                                              ▼
  Pass 1: Import Boundaries      Pass 5: Export Shape Enforcement
  Pass 2: Required Directives    Pass 6: Circular Import Detection
  Pass 3: Filename Conventions   Pass 7: Dead Export Detection
  Pass 4: Custom Rules
       │
       ▼
  Violation[]  →  arc check output
       │
       └──────────── arc map ──────────────────────────────────────▶ CODEBASE.md
```

### 4.1 `lexer.js`

**Input:** raw string
**Output:** `Token[]`

```javascript
function tokenize(source) → Token[]
// { type, value, line, col }
```

**Rules:**

- Single-pass character iterator — no regex on full source
- Track `line` and `col` for every token start position
- Discard comments (`#` to end of line) — emit nothing
- Discard whitespace and newlines — emit nothing
- `"""..."""`: trim leading/trailing whitespace from captured content
- `+` in stack declarations: emit as `PLUS` token
- Unrecognized character: skip silently, advance

### 4.2 `parser.js`

**Input:** `Token[]`
**Output:** `ArchAST`

```javascript
class Parser {
  constructor(tokens)
  parse() → ArchAST
}
```

**Internal helpers required:**

- `peek()` — look at current token without consuming
- `advance()` — consume and return current token
- `expect(type, value?)` — consume or throw with line number
- `eatIf(type, value?)` — consume if matches, else no-op, return boolean
- `parseStringList()` — consume `[` ... `]` returning string[]

**Top-level dispatch:** reads first token of each statement, calls appropriate `parse*` method.

**`enforce` parsing:** `enforce no-circular-imports` sets `ast.enforcements.noCircularImports = true`. Same for all four enforce flags.

### 4.3 `checker.js`

**Input:** `ArchAST`, `cwd` string
**Output:** `Violation[]`

```javascript
class Checker {
  constructor(ast, cwd)
  run() → Violation[]
}

// Violation shape:
{
  severity: "error" | "warning",
  rule:     string,            // rule id or built-in pass name
  file:     string,            // relative path, forward-slash normalized
  line:     number | undefined,
  message:  string,
}
```

#### Pass 1 — Import Boundary Violations

For every non-`readonly` layer:

1. Walk all `.ts` `.tsx` `.js` `.jsx` files under `layer.path`
2. For each line matching `/from\s+['"](@\/[^'"]+)['"]/`
3. Resolve `@/` → `src/`
4. Check if resolved path falls under another layer's `path`
5. If that layer is NOT in `canImport` → violation

```md
rule:    "import-boundary"
message: "[{fromLayer}] cannot import from [{toLayer}] → \"{importPath}\""
```

#### Pass 2 — Required Directive Violations

For every layer with `directive` set:

1. Walk all files in layer
2. Check file content includes `"${directive}"` or `'${directive}'`
3. If missing → violation

```md
rule:    "missing-directive"
message: "Missing \"{directive}\" — required in [{layerName}] layer"
severity: always "error"
```

#### Pass 3 — Filename Convention Violations

For every layer with `requireFilename` set:

1. Walk all files in layer
2. Convert glob pattern to regex: `use*.ts` → `/^use.*\.ts$/`
3. Test each filename (basename only, not full path)
4. If no match → violation

```md
rule:    "filename-convention"
message: "File \"{filename}\" does not match required pattern \"{pattern}\" in [{layerName}]"
```

**Glob to regex conversion rules:**

- `*` → `.*`
- `.` → `\\.`
- `{Name}` → `[A-Z][a-zA-Z0-9]*` (PascalCase token)
- `{domain}` → `[a-z][a-zA-Z0-9]*` (camelCase token)
- `{name}` → `[a-zA-Z][a-zA-Z0-9\\-]*` (any case token)
- Anchor with `^` and `$`

#### Pass 4 — Custom Rule Violations

For each rule in `ast.rules`:

**If `forbidType === "import"`:**

- For every layer NOT in `rule.exceptIn`
- Walk files, check each line for import statement containing `rule.forbidValue`
- Match only on lines where trimmed line starts with `import` or `from`

**If `forbidType === "pattern"`:**

- If `rule.inLayers` non-empty: only those layers; else all layers
- Walk files, check each non-comment, non-blank line for `rule.forbidValue` substring
- Skip lines where trimmed starts with `//` or `*`

**If `forbidType === "package"`:**

- Same as `"import"` but match against `node_modules` package name
- Match both `import x from 'pkg'` and `import x from 'pkg/subpath'`

```md
rule:    rule.id
message: rule.description + (pattern: " — found \"{forbidValue}\"")
```

#### Pass 5 — Export Shape Violations

For every layer with `requireExports`, `allowExports`, or `forbidExports` set:

1. Walk all files in layer
2. Extract all export statements:
   - `export async function` → type `async-function`
   - `export function` → type `function`
   - `export class` → type `class`
   - `export const` → type `const`
   - `export type` → type `type`
   - `export interface` → type `interface`
   - `export enum` → type `enum`
   - `export default` → type `default`
   - `export { ... }` → type `named`

**`requireExports` check:** every export in the file must match the required type.
**`allowExports` check:** every export type must be in the allow list.
**`forbidExports` check:** no export may be of a forbidden type.

```md
rule:    "export-shape"
message: "[{layerName}] forbids {exportType} exports — found in \"{exportStatement}\""
```

#### Pass 6 — Circular Import Detection

**Only runs if `ast.enforcements.noCircularImports === true`.**

Uses `graph.js` to build and analyze the import graph:

1. Walk ALL files across ALL layers
2. Extract every `from '...'` import, resolve to absolute path
3. Build directed graph: `Map<string, Set<string>>` (file → files it imports)
4. Run DFS cycle detection (Tarjan's or simple visited/stack approach)
5. For each cycle found, report the shortest cycle path

```md
rule:    "circular-import"
severity: "error"
message: "Circular import detected: {fileA} → {fileB} → ... → {fileA}"
```

#### Pass 7 — Dead Export Detection

**Only runs if `ast.enforcements.noDeadExports === true`.**

1. Walk ALL files, collect every exported symbol name + source file
2. Walk ALL files, collect every imported symbol name + source file
3. For each exported symbol: if it appears in no import anywhere → violation

```md
rule:    "dead-export"
severity: "warning"
message: "\"{symbolName}\" is exported but never imported anywhere"
```

**Exclusions — never flag as dead:**

- Default exports from `page.tsx`, `layout.tsx`, `route.ts` (Next.js conventions)
- Exports from `src/types/index.ts` used only as TypeScript types (hard to trace)
- Any file matching `*.test.ts` or `*.spec.ts`
- `index.ts` barrel re-exports

### 4.4 `graph.js`

```javascript
// Builds import graph from file set
function buildGraph(files, cwd) → Map<string, Set<string>>

// Detects cycles, returns array of cycle paths
function detectCycles(graph) → string[][]
```

**Algorithm:** iterative DFS with visited set + recursion stack.
Return each cycle as an array of file paths forming the loop.

### 4.5 `mapper.js`

**Input:** `ArchAST`, `cwd`
**Output:** writes `.arc/CODEBASE.md`

```javascript
class Mapper {
  constructor(ast, cwd)
  generate() → string
  write()               // writes to .arc/CODEBASE.md, creates dir if needed
}
```

**`CODEBASE.md` structure (in order):**

```markdown
# CODEBASE MAP
> Auto-generated from `project.arc` on {ISO timestamp}
> Run `arc map` to regenerate. Do not edit manually.

---

## Project: {name}
- Version / Stack / Language

---

## Summary
{context.summary}

### Critical Files
### Do Not Touch

---

## Architecture Layers
{table: Layer | Path | Can Import From | Files}

### Layer Detail
{per layer: description, directive, filename pattern, export rules, readonly flag}

---

## Enforcements
{list active enforce flags}

---

## Data Flows
{per flow: description, numbered steps, files, tables, fields}

---

## Rules ({n} total)
{table: ID | Severity | Description | Type}

---

## Naming Conventions
{table: Name | Pattern}

---

## File Tree
{emoji tree of src/}
```

### 4.6 `scaffold.js`

**Input:** `ArchAST`, `cwd`, `type` string, `name` string
**Output:** creates file at correct path

```javascript
function scaffold(ast, cwd, type, name) → void
```

**Reads conventions from `ast.conventions` to determine output path.**
Interpolates `{Name}` as PascalCase, `{domain}` and `{name}` as provided.

**Built-in templates by convention name:**

`server-action` / `action`:

```typescript
'use server'
import { prisma } from '@/lib/db'
import type { ActionResult } from '@/types'

export async function get{Name}(): Promise<ActionResult<any>> {
  try {
    return { success: true, data: null }
  } catch (error) {
    return { success: false, error: 'Failed to get {name}' }
  }
}
```

`hook`:

```typescript
'use client'
import { useState, useEffect } from 'react'

export function use{Name}() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // TODO: implement
  }, [])

  return { data, loading, error }
}
```

`component`:

```typescript
type {Name}Props = {
  // TODO: define props
}

export function {Name}({}: {Name}Props) {
  return (
    <div>
      {/* TODO: implement {Name} */}
    </div>
  )
}
```

`service`:

```typescript
import type { ActionResult } from '@/types'

export class {Name}Service {
  async get{Name}(): Promise<ActionResult<any>> {
    try {
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: 'Failed' }
    }
  }
}
```

`api-route`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  return NextResponse.json({ ok: true })
}
```

**Error conditions:**

- File already exists → print error, exit 1, do not overwrite
- Unknown scaffold type → print available types, exit 1
- Create parent directories recursively with `fs.mkdirSync(..., { recursive: true })`

### 4.7 `templates.js`

Exports built-in `project.arc` content strings for each template preset.

```javascript
module.exports = {
  'vanilla':      '...',   // Pure HTML+CSS+JS
  'react-spa':    '...',   // React + Vite + TypeScript
  'nextjs':       '...',   // Next.js App Router
  'express-api':  '...',   // Express + TypeScript
  'cli':          '...',   // CLI Tool
  'extension':    '...',   // Browser Extension
}
```

Used by `arc init <template>` command.

---

## 5. CLI Tool — Full Spec

### 5.1 Entry Point

File: `arc.js`
First line: `#!/usr/bin/env node`
Second line: `'use strict'`
No npm dependencies. Only: `require('fs')`, `require('path')`, and local `./` modules.

### 5.2 Commands

```md
arc check                    Validate codebase against project.arc
arc map                      Generate .arc/CODEBASE.md
arc print                    Pretty-print parsed project.arc
arc scaffold <type> <name>   Create file following named convention
arc init [template]          Create project.arc from built-in template
arc help                     Print help
```

### 5.3 ANSI Color Scheme

Raw ANSI only — no chalk:

```javascript
const c = {
  red:    s => `\x1b[31m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  blue:   s => `\x1b[34m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
}
```

**Color assignments:**

- Command headers (`◆ arc check`): bold blue
- Success `✓`: green
- Warnings `⚠`: yellow
- Errors `✗`: red
- Layer/rule/flow names in print: cyan
- File paths and secondary info: dim
- Violation file paths: red (error) or yellow (warning)
- `└─` message lines: dim

### 5.4 `arc check` — Exact Output Format

```md
◆ arc check

  Parsed project.arc — 7 layers, 6 rules, 2 enforcements

  ⚠  2 warnings:

  src/components/app/Widget.tsx:3
  └─ [no-console-logs] Remove console.log before shipping — found "console.log"

  src/actions/notes.ts:47
  └─ [no-any-types] Avoid 'any' — use proper types from src/types — found ": any"

  ✗  3 errors:

  src/components/app/NoteList.tsx:1
  └─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

  src/hooks/useNotes.ts
  └─ [missing-directive] Missing "use client" — required in [hooks] layer

  src/hooks/fetchNotes.ts
  └─ [filename-convention] File "fetchNotes.ts" does not match required pattern "use*.ts" in [hooks]

  Architecture check failed. 3 errors, 2 warnings.
```

**Exit behavior:**

- `0` if zero violations, or warnings only
- `1` if any errors

**If `project.arc` not found:**

```md
✗  No project.arc found in /path/to/cwd

  Run arc init to create one, or arc init nextjs for a template.
```

**If parse fails:**

```md
✗  Failed to parse project.arc

  [arc parser] Line 14: expected STRING but got KEYWORD ("layer")
```

### 5.5 `arc map` — Exact Output Format

```md
◆ arc map

  ✓  Generated .arc/CODEBASE.md

  Tip: paste project.arc into Claude or Cursor for instant full codebase context.
```

### 5.6 `arc print` — Exact Output Format

```md
◆ arc print

  note-app v1.0.0
  nextjs + supabase + prisma + polar + shadcn + tailwind · typescript

  Layers (7)
  types             src/types
                    imports: none
  lib               src/lib
                    imports: types
  actions           src/actions
                    imports: types, lib  |  requires: "use server"  |  exports: async-function
  hooks             src/hooks
                    imports: types, lib  |  requires: "use client"  |  filename: use*.ts
  components        src/components/app
                    imports: types, hooks, lib
  ui                src/components/ui
                    imports: types  |  readonly
  app               src/app
                    imports: types, hooks, components, actions, lib

  Enforcements
  ✓ no-circular-imports
  ✓ no-dead-exports

  Rules (6)
  error    no-prisma-outside-lib-actions
           Prisma can only be used in lib and actions layers
  error    no-process-env-scatter
           All env vars must go through src/config
  warning  no-any-types
           Avoid 'any' — use proper types from src/types
  warning  no-console-logs
           Remove console.log before shipping

  Flows (4)
  auth               Google OAuth → Supabase creates auth.users...
  payment            Polar checkout → webhook → profiles.is_paid...
  notes              Authenticated user CRUD via server actions + Prisma
  access-control     Protected pages check profiles.is_paid

  Conventions (6)
  action             src/actions/{domain}.ts
  hook               src/hooks/use{Name}.ts
  component          src/components/app/{Name}.tsx
  api-route          src/app/api/{path}/route.ts
  page               src/app/{path}/page.tsx
  layout             src/app/{path}/layout.tsx
```

### 5.7 `arc scaffold` — Exact Output Format

```md
$ arc scaffold action payments
  ✓  Created src/actions/payments.ts

$ arc scaffold hook Profile
  ✓  Created src/hooks/useProfile.ts

$ arc scaffold component NoteCard
  ✓  Created src/components/app/NoteCard.tsx
```

Error case:

```md
$ arc scaffold action notes
  ✗  File already exists: src/actions/notes.ts
```

### 5.8 `arc init` — Exact Output Format

```md
$ arc init nextjs
  ✓  Created project.arc (nextjs template)

  Edit project.arc to match your codebase, then run arc check.
```

```md
$ arc init
  Available templates:
  vanilla        Pure HTML + CSS + JavaScript
  react-spa      React + Vite + TypeScript
  nextjs         Next.js App Router + TypeScript
  express-api    Node.js + Express + TypeScript
  cli            CLI Tool (Node.js + TypeScript)
  extension      Browser Extension (TypeScript)

  Usage: arc init <template>
```

### 5.9 `arc help` — Exact Output Format

```md
arc — architecture compiler for your codebase

Usage:
  arc check                  Validate codebase against project.arc
  arc map                    Generate .arc/CODEBASE.md
  arc print                  Pretty-print parsed project.arc
  arc scaffold <type> <n>    Create file following named convention
  arc init [template]        Create project.arc from template
  arc help                   Show this help

Your project.arc file declares:
  arc          project name, stack, version
  layer        paths, import rules, export shape, naming
  rule         forbidden imports, patterns, packages
  enforce      global flags: no-circular-imports, no-dead-exports
  flow         data flows (documentation)
  convention   file naming patterns + scaffold templates
  context      AI-readable project summary

Add to package.json:
  "prebuild": "node arc-cli/arc.js check"

  Your build now fails on architecture violations,
  exactly like TypeScript fails on type errors.
```

### 5.10 `package.json`

```json
{
  "name": "arc-cli",
  "version": "1.0.0",
  "description": "Architecture compiler — enforces codebase rules from a project.arc file",
  "main": "arc.js",
  "bin": {
    "arc": "./arc.js"
  },
  "scripts": {
    "test": "node arc.js help"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["architecture", "compiler", "linter", "nextjs", "dsl"],
  "license": "MIT"
}
```

---

## 6. VS Code Extension — Syntax Highlighter

### 6.1 Extension Manifest (`package.json`)

```json
{
  "name": "arc-language",
  "displayName": "arc — Architecture DSL",
  "description": "Syntax highlighting for .arc architecture definition files",
  "version": "1.0.0",
  "publisher": "arc-lang",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Programming Languages"],
  "contributes": {
    "languages": [{
      "id": "arc",
      "aliases": ["Arc", "arc"],
      "extensions": [".arc"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "arc",
      "scopeName": "source.arc",
      "path": "./syntaxes/arc.tmLanguage.json"
    }]
  }
}
```

### 6.2 Language Configuration (`language-configuration.json`)

```json
{
  "comments": {
    "lineComment": "#"
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "\"", "close": "\"" }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["\"", "\""]
  ],
  "indentationRules": {
    "increaseIndentPattern": "\\{\\s*$",
    "decreaseIndentPattern": "^\\s*\\}"
  }
}
```

### 6.3 TextMate Grammar (`syntaxes/arc.tmLanguage.json`)

**Visual targets — what each element looks like in VS Code:**

| Element | Scope | Typical color |
| --- | --- | --- |
| `# comments` | `comment.line.number-sign.arc` | Green / muted |
| `"""..."""` | `string.quoted.triple.arc` | Orange/Yellow |
| `"strings"` | `string.quoted.double.arc` | Orange/Yellow |
| `arc`, `layer`, `rule`, `flow`, `convention`, `context`, `enforce` | `keyword.control.arc` | Purple/Blue |
| `path`, `description`, `can`, `import`, `require`, `allow`, `forbid`, `severity`, `directive`, `filename`, `exports`, `readonly`, `except`, `in`, `layers`, `steps`, `touches`, `tables`, `fields`, `summary`, `critical-files`, `do-not-touch`, `version`, `stack`, `language` | `support.function.arc` | Teal/Cyan |
| `error`, `warning` | `constant.language.arc` | Orange/Red |
| `async-function`, `type`, `interface`, `named`, `default`, `enum`, `function`, `class`, `const` | `support.type.arc` | Green |
| `no-circular-imports`, `no-dead-exports`, `no-implicit-any`, `no-floating-promises` | `variable.language.arc` | Light blue |
| Block names after `layer`/`rule`/`flow` | `entity.name.function.arc` | Yellow/Gold |
| Project name after `arc` | `entity.name.type.arc` | Blue |
| `+` operator | `keyword.operator.arc` | White/Default |
| `{` `}` `[` `]` | `punctuation.section.arc` | White/Default |

```json
{
  "name": "arc",
  "scopeName": "source.arc",
  "fileTypes": ["arc"],
  "patterns": [
    { "include": "#comments" },
    { "include": "#multiline-strings" },
    { "include": "#enforce-declarations" },
    { "include": "#block-definitions" },
    { "include": "#convention-declaration" },
    { "include": "#field-keywords" },
    { "include": "#export-type-values" },
    { "include": "#severity-values" },
    { "include": "#strings" },
    { "include": "#operators" },
    { "include": "#punctuation" }
  ],
  "repository": {
    "comments": {
      "name": "comment.line.number-sign.arc",
      "match": "#.*$"
    },
    "multiline-strings": {
      "name": "string.quoted.triple.arc",
      "begin": "\"\"\"",
      "end": "\"\"\""
    },
    "strings": {
      "name": "string.quoted.double.arc",
      "begin": "\"",
      "end": "\"",
      "patterns": []
    },
    "enforce-declarations": {
      "match": "\\b(enforce)\\s+(no-circular-imports|no-dead-exports|no-implicit-any|no-floating-promises)\\b",
      "captures": {
        "1": { "name": "keyword.control.arc" },
        "2": { "name": "variable.language.arc" }
      }
    },
    "block-definitions": {
      "patterns": [
        {
          "match": "\\b(arc)\\b\\s+(\"[^\"]*\")",
          "captures": {
            "1": { "name": "keyword.control.arc" },
            "2": { "name": "entity.name.type.arc" }
          }
        },
        {
          "match": "\\b(layer|rule|flow)\\b\\s+([a-zA-Z][a-zA-Z0-9_\\-]*|\"[^\"]*\")",
          "captures": {
            "1": { "name": "keyword.control.arc" },
            "2": { "name": "entity.name.function.arc" }
          }
        },
        {
          "match": "\\b(convention|context)\\b",
          "name": "keyword.control.arc"
        }
      ]
    },
    "convention-declaration": {
      "match": "\\b(convention)\\s+([a-zA-Z][a-zA-Z0-9_\\-]*)\\s+(\"[^\"]*\")",
      "captures": {
        "1": { "name": "keyword.control.arc" },
        "2": { "name": "entity.name.function.arc" },
        "3": { "name": "string.quoted.double.arc" }
      }
    },
    "field-keywords": {
      "match": "\\b(path|description|can|import|require|allow|forbid|directive|filename|exports|readonly|severity|pattern|package|except|in|layers|steps|touches|tables|fields|summary|critical-files|do-not-touch|version|stack|language)\\b",
      "name": "support.function.arc"
    },
    "export-type-values": {
      "match": "\\b(async-function|interface|named|default|enum|function|class|const)\\b",
      "name": "support.type.arc"
    },
    "severity-values": {
      "match": "\\b(error|warning)\\b",
      "name": "constant.language.arc"
    },
    "operators": {
      "match": "\\+",
      "name": "keyword.operator.arc"
    },
    "punctuation": {
      "patterns": [
        { "match": "[{}]", "name": "punctuation.section.arc" },
        { "match": "[\\[\\]]", "name": "punctuation.definition.arc" }
      ]
    }
  }
}
```

### 6.4 Installing the Extension

```bash
# Development: install from folder
# VS Code: Cmd+Shift+P → "Developer: Install Extension from Location" → select arc-vscode/

# Package and install:
cd arc-vscode
npx vsce package
code --install-extension arc-language-1.0.0.vsix
```

---

## 7. Built-in Architecture Templates

These are the complete `project.arc` contents for each `arc init <template>` preset.
Store each as a string in `templates.js`.

### Template 1 — `vanilla` (Pure HTML + CSS + JS)

```md
arc "vanilla-app" {
  version  "1.0.0"
  stack    html + css + javascript
  language javascript
}

layer config {
  path        "src/config"
  description "App configuration and constants. No DOM access."
  can import  []
}

layer utils {
  path        "src/utils"
  description "Pure functions. No DOM. No side effects. Fully testable."
  can import  [config]
}

layer api {
  path        "src/api"
  description "HTTP fetch calls only. Returns raw data. No DOM."
  can import  [config, utils]
}

layer state {
  path        "src/state"
  description "Application state. No DOM manipulation."
  can import  [config, utils]
}

layer ui {
  path        "src/ui"
  description "DOM manipulation, event listeners, rendering only."
  can import  [config, utils, api, state]
}

layer main {
  path        "src/main.js"
  description "Entry point. Wires everything together."
  can import  [config, utils, api, state, ui]
}

rule "no-dom-in-utils" {
  severity    error
  description "Pure utility functions must not touch the DOM"
  forbid pattern "document."
  in layers   [utils, api, state, config]
}

rule "no-fetch-in-ui" {
  severity    error
  description "UI layer must not make HTTP calls — use api layer"
  forbid pattern "fetch("
  in layers   [ui]
}

rule "no-var" {
  severity    warning
  description "Prefer const/let over var"
  forbid pattern "var "
  in layers   [utils, api, state, ui]
}

rule "no-console" {
  severity    warning
  description "Remove debug console statements"
  forbid pattern "console.log"
  in layers   [utils, api, state, ui]
}

enforce no-circular-imports

convention util      "src/utils/{name}.js"
convention api       "src/api/{resource}.js"
convention component "src/ui/components/{name}.js"

context {
  summary """
    Vanilla HTML + CSS + JavaScript app.
    No framework. Strict layering: config → utils → api/state → ui.
    DOM manipulation only in ui layer.
    HTTP calls only in api layer.
    State management only in state layer.
  """
  critical-files ["src/main.js", "src/config/index.js"]
  do-not-touch   []
}
```

---

### Template 2 — `react-spa` (React + Vite + TypeScript)

```md
arc "react-spa" {
  version  "1.0.0"
  stack    react + typescript + vite + react-query + zustand
  language typescript
}

layer types {
  path        "src/types"
  description "TypeScript types and interfaces only. Zero logic."
  can import  []
  allow exports [type, interface, enum]
  forbid exports [function, class, const]
}

layer config {
  path        "src/config"
  description "Typed env vars, constants, feature flags."
  can import  [types]
}

layer utils {
  path        "src/utils"
  description "Pure functions. Framework-agnostic. Fully testable."
  can import  [types, config]
}

layer api {
  path        "src/api"
  description "API client functions. Typed responses. No React."
  can import  [types, config, utils]
}

layer store {
  path        "src/store"
  description "Zustand global state slices. No direct API calls."
  can import  [types, config]
}

layer hooks {
  path        "src/hooks"
  description "React Query + custom hooks. Bridges api and components."
  can import  [types, config, utils, api, store]
  require filename "use*.ts"
}

layer components {
  path        "src/components"
  description "Reusable UI components. No direct API calls."
  can import  [types, utils, hooks, config]
}

layer pages {
  path        "src/pages"
  description "Route-level page components. May compose store + components."
  can import  [types, utils, hooks, components, store, config]
}

rule "no-api-in-components" {
  severity    error
  description "Components must not call API directly — use hooks"
  forbid import "@/api"
  except in   [hooks, pages]
}

rule "no-store-mutation-in-components" {
  severity    warning
  description "Components should not write to store — use hooks"
  forbid pattern ".setState("
  in layers   [components]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, api, hooks, utils]
}

rule "no-inline-styles" {
  severity    warning
  description "Use CSS modules or Tailwind — no inline style props"
  forbid pattern "style={{"
  in layers   [components, pages]
}

rule "no-process-env-scatter" {
  severity    error
  description "Access env vars through src/config only"
  forbid pattern "import.meta.env."
  except in   [config]
}

enforce no-circular-imports
enforce no-dead-exports

convention hook      "src/hooks/use{Name}.ts"
convention component "src/components/{Name}/{Name}.tsx"
convention page      "src/pages/{Name}Page.tsx"
convention api       "src/api/{resource}.api.ts"
convention store     "src/store/{domain}.store.ts"
convention type      "src/types/{domain}.types.ts"

context {
  summary """
    React SPA built with Vite and TypeScript.
    State: Zustand for global, React Query for server state.
    Strict layering: types → config → utils → api/store → hooks → components → pages.
    API calls only in api layer and accessed via hooks.
    Types layer exports types/interfaces only — no logic.
  """
  critical-files [
    "src/types/index.ts"
    "src/config/index.ts"
    "src/api/client.ts"
  ]
  do-not-touch []
}
```

---

### Template 3 — `nextjs` (Next.js App Router)

```md
arc "nextjs-app" {
  version  "1.0.0"
  stack    nextjs + typescript + prisma + postgres + shadcn + tailwind
  language typescript
}

layer types {
  path        "src/types"
  description "All TypeScript types. No logic."
  can import  []
  allow exports [type, interface, enum]
}

layer config {
  path        "src/config"
  description "Single access point for all process.env vars. Validated at startup."
  can import  [types]
}

layer lib {
  path        "src/lib"
  description "Prisma client, Supabase client, Polar helpers, email client."
  can import  [types, config]
}

layer actions {
  path        "src/actions"
  description "Next.js Server Actions. All DB access lives here."
  can import  [types, config, lib]
  require directive "use server"
  require exports async-function
}

layer hooks {
  path        "src/hooks"
  description "React hooks. Client-side only."
  can import  [types, config]
  require directive "use client"
  require filename "use*.ts"
}

layer components {
  path        "src/components/app"
  description "App UI components. No direct DB. No direct Prisma."
  can import  [types, hooks, config]
}

layer ui {
  path        "src/components/ui"
  description "shadcn/ui — never edit manually."
  can import  [types]
  readonly
}

layer app {
  path        "src/app"
  description "Next.js pages, layouts, API routes."
  can import  [types, config, hooks, components, actions, lib]
}

rule "no-prisma-in-components" {
  severity    error
  description "Prisma only in lib and actions"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

rule "no-process-env-scatter" {
  severity    error
  description "All env vars through src/config — never process.env directly"
  forbid pattern "process.env."
  in layers   [actions, hooks, components, app]
}

rule "no-next-router" {
  severity    error
  description "Use next/navigation not next/router in App Router"
  forbid import "next/router"
  except in   []
}

rule "no-any" {
  severity    warning
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, actions, lib, hooks]
}

rule "no-console" {
  severity    warning
  description "Remove console.log before shipping"
  forbid pattern "console.log"
  in layers   [components, hooks, app, actions]
}

enforce no-circular-imports

convention action    "src/actions/{domain}.ts"
convention hook      "src/hooks/use{Name}.ts"
convention component "src/components/app/{Name}.tsx"
convention api-route "src/app/api/{path}/route.ts"
convention page      "src/app/{path}/page.tsx"
convention layout    "src/app/{path}/layout.tsx"

context {
  summary """
    Next.js 14 App Router application. TypeScript strict mode.
    DB access exclusively via Prisma — only in src/lib and src/actions.
    Server Actions in src/actions — all must have "use server".
    Client hooks in src/hooks — all must have "use client".
    Env vars accessed only through src/config.
    shadcn/ui in src/components/ui — never edit manually.
  """
  critical-files [
    "src/types/index.ts"
    "src/config/index.ts"
    "src/lib/db.ts"
  ]
  do-not-touch ["src/components/ui/"]
}
```

---

### Template 4 — `express-api` (Node.js + Express + TypeScript)

```md
arc "express-api" {
  version  "1.0.0"
  stack    nodejs + express + typescript + prisma + postgres
  language typescript
}

layer types {
  path        "src/types"
  description "Shared domain types. No Express types allowed here."
  can import  []
  allow exports [type, interface, enum]
}

layer config {
  path        "src/config"
  description "All env vars loaded and validated here."
  can import  [types]
}

layer db {
  path        "src/db"
  description "Prisma client singleton. Only file that touches Prisma directly."
  can import  [config]
}

layer repositories {
  path        "src/repositories"
  description "Data access. Prisma queries only. Returns domain types."
  can import  [types, config, db]
}

layer services {
  path        "src/services"
  description "Business logic. No Express types. No HTTP concepts. Fully testable."
  can import  [types, config, repositories]
}

layer middleware {
  path        "src/middleware"
  description "Express middleware: auth, validation, error handling."
  can import  [types, config, services]
}

layer controllers {
  path        "src/controllers"
  description "HTTP request handlers. Parse request, call service, send response."
  can import  [types, config, services, middleware]
}

layer routes {
  path        "src/routes"
  description "Route registration only. No inline logic."
  can import  [types, controllers, middleware]
}

layer app {
  path        "src/app.ts"
  description "Express setup. Register routes and middleware."
  can import  [types, config, routes, middleware]
}

rule "no-express-in-services" {
  severity    error
  description "Services must be framework-agnostic — no Express imports"
  forbid import "express"
  except in   [middleware, controllers, routes, app]
}

rule "no-prisma-in-services" {
  severity    error
  description "Services must use repositories — never Prisma directly"
  forbid import "@prisma/client"
  except in   [db, repositories]
}

rule "no-db-in-controllers" {
  severity    error
  description "Controllers must delegate to services — no DB access"
  forbid import "@/db"
  except in   [repositories]
}

rule "no-process-env-scatter" {
  severity    error
  description "All env access through src/config"
  forbid pattern "process.env."
  in layers   [repositories, services, controllers, routes]
}

rule "no-logic-in-routes" {
  severity    warning
  description "Routes register handlers only — extract logic to controllers"
  forbid pattern "async (req, res)"
  in layers   [routes]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, services, repositories, controllers]
}

enforce no-circular-imports
enforce no-dead-exports

convention repository  "src/repositories/{Name}Repository.ts"
convention service     "src/services/{Name}Service.ts"
convention controller  "src/controllers/{Name}Controller.ts"
convention route       "src/routes/{name}.routes.ts"
convention middleware  "src/middleware/{name}.middleware.ts"

flow request-lifecycle {
  description "HTTP request travels: route → middleware → controller → service → repository → DB"
  steps [
    "request hits Express router"
    "auth + validation middleware runs"
    "controller method called"
    "controller calls service method"
    "service applies business logic"
    "service calls repository"
    "repository executes Prisma query"
    "result flows back up chain"
    "controller sends HTTP response"
  ]
}

context {
  summary """
    Express REST API. TypeScript strict mode.
    Strict four-layer architecture: repositories → services → controllers → routes.
    Services have zero knowledge of HTTP — fully testable in isolation.
    All Prisma access confined to src/repositories.
    All env vars through src/config.
  """
  critical-files [
    "src/types/index.ts"
    "src/config/index.ts"
    "src/db/index.ts"
    "src/app.ts"
  ]
  do-not-touch []
}
```

---

### Template 5 — `cli` (CLI Tool, Node.js + TypeScript)

```md
arc "cli-tool" {
  version  "1.0.0"
  stack    nodejs + typescript
  language typescript
}

layer types {
  path        "src/types"
  description "All types. No I/O."
  can import  []
  allow exports [type, interface, enum]
}

layer config {
  path        "src/config"
  description "CLI config, defaults, env vars."
  can import  [types]
}

layer utils {
  path        "src/utils"
  description "Pure functions. No I/O. No process.exit. Fully testable."
  can import  [types, config]
}

layer core {
  path        "src/core"
  description "Core logic. Pure. No I/O. No process.exit."
  can import  [types, config, utils]
}

layer io {
  path        "src/io"
  description "File system, network, stdin/stdout access."
  can import  [types, config, utils]
}

layer commands {
  path        "src/commands"
  description "One file per CLI command. Parses args, calls core + io."
  can import  [types, config, utils, core, io]
}

layer bin {
  path        "bin"
  description "Entry point only. Parses top-level args, calls commands."
  can import  [types, config, commands]
}

rule "no-fs-in-core" {
  severity    error
  description "Core logic must be pure — no file system access"
  forbid import "fs"
  except in   [io, bin]
}

rule "no-process-exit-outside-bin" {
  severity    error
  description "Only bin/ may call process.exit — use return values elsewhere"
  forbid pattern "process.exit"
  in layers   [core, utils, commands, io]
}

rule "no-console-in-core" {
  severity    error
  description "Core must not print — return values, let commands print"
  forbid pattern "console."
  in layers   [core, utils]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, core, utils, commands]
}

enforce no-circular-imports

convention command  "src/commands/{name}.command.ts"
convention util     "src/utils/{name}.ts"
convention core     "src/core/{name}.ts"
convention io       "src/io/{name}.io.ts"

context {
  summary """
    Node.js CLI tool. TypeScript strict mode.
    Pure core logic with zero I/O — fully unit testable.
    All I/O (fs, network, stdout) confined to src/io.
    process.exit only in bin/ entry point.
    One file per command in src/commands.
  """
  critical-files ["src/config/index.ts", "bin/cli.ts"]
  do-not-touch   []
}
```

---

### Template 6 — `extension` (Browser Extension, TypeScript)

```md
arc "browser-extension" {
  version  "1.0.0"
  stack    chrome-extension + typescript + vite
  language typescript
}

layer types {
  path        "src/types"
  description "Shared types across all extension contexts."
  can import  []
  allow exports [type, interface, enum]
}

layer utils {
  path        "src/utils"
  description "Pure utility functions. No browser APIs."
  can import  [types]
}

layer storage {
  path        "src/storage"
  description "chrome.storage wrapper. Single access point for persistence."
  can import  [types]
}

layer messaging {
  path        "src/messaging"
  description "chrome.runtime message passing. Typed message contracts."
  can import  [types]
}

layer background {
  path        "src/background"
  description "Service worker. Handles events, coordinates messaging."
  can import  [types, utils, storage, messaging]
}

layer content {
  path        "src/content"
  description "Content scripts. Only layer with host page DOM access."
  can import  [types, utils, messaging]
}

layer popup {
  path        "src/popup"
  description "Popup UI. No direct access to host page DOM."
  can import  [types, utils, storage, messaging]
}

rule "no-dom-in-background" {
  severity    error
  description "Background service worker has no DOM access"
  forbid pattern "document."
  in layers   [background, storage, messaging, utils]
}

rule "no-raw-storage" {
  severity    error
  description "Use storage layer — never call chrome.storage directly"
  forbid pattern "chrome.storage"
  except in   [storage]
}

rule "no-raw-messaging" {
  severity    error
  description "Use messaging layer — never call chrome.runtime directly"
  forbid pattern "chrome.runtime.sendMessage"
  except in   [messaging]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, utils, storage, messaging, background]
}

enforce no-circular-imports

convention message   "src/messaging/{name}.message.ts"
convention storage   "src/storage/{name}.storage.ts"

context {
  summary """
    Chrome browser extension. TypeScript strict mode.
    Three isolated contexts: background (service worker), content (page), popup (UI).
    All chrome.storage access through src/storage layer.
    All chrome.runtime message passing through src/messaging layer.
    Background has no DOM access.
  """
  critical-files ["src/types/index.ts", "src/messaging/index.ts", "src/storage/index.ts"]
  do-not-touch   []
}
```

---

## 8. The `project.arc` File for This Codebase

This is the production `project.arc` for the Next.js note-taking app.
Place at project root. Reflects the actual structure exactly.

```md
# project.arc
# Single source of truth for codebase architecture
# Run: arc check   → enforce rules (automatic on npm run build)
# Run: arc map     → generate .arc/CODEBASE.md
# Run: arc print   → see full architecture summary

arc "note-app" {
  version  "1.0.0"
  stack    nextjs + supabase + prisma + polar + shadcn + tailwind
  language typescript
}

layer types {
  path        "src/types"
  description "All TypeScript types derived from Prisma. No logic, no side effects."
  can import  []
  allow exports [type, interface, enum]
  forbid exports [function, class, const]
}

layer config {
  path        "src/config"
  description "Single access point for all process.env vars. Typed and validated."
  can import  [types]
}

layer lib {
  path        "src/lib"
  description "Prisma client singleton, Supabase client, Polar webhook helpers."
  can import  [types, config]
}

layer actions {
  path        "src/actions"
  description "Next.js Server Actions. All DB access lives here. Never called client-side directly."
  can import  [types, config, lib]
  require directive "use server"
  require exports async-function
}

layer hooks {
  path        "src/hooks"
  description "React hooks. Client-side state and data fetching. No direct DB."
  can import  [types, config]
  require directive "use client"
  require filename "use*.ts"
}

layer components {
  path        "src/components/app"
  description "App UI components. No Prisma. No Supabase. No direct DB access."
  can import  [types, hooks, config]
}

layer ui {
  path        "src/components/ui"
  description "shadcn/ui components. Auto-generated by shadcn CLI. Never manually edit."
  can import  [types]
  readonly
}

layer app {
  path        "src/app"
  description "Next.js App Router: pages, layouts, API routes."
  can import  [types, config, hooks, components, actions, lib]
}

rule "no-prisma-outside-lib-actions" {
  severity    error
  description "Prisma client can only be imported in src/lib and src/actions"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

rule "no-supabase-ssr-in-client-layers" {
  severity    error
  description "Supabase SSR server client must not be used in components or hooks"
  forbid import "@supabase/ssr"
  except in   [lib, actions, app]
}

rule "no-db-client-in-components" {
  severity    error
  description "Components must not import Prisma db client — use server actions"
  forbid import "@/lib/db"
  except in   [actions, lib]
}

rule "no-polar-in-components" {
  severity    error
  description "Polar payment logic must stay in lib and actions — not in UI"
  forbid import "@/lib/polar"
  except in   [actions, lib, app]
}

rule "no-process-env-scatter" {
  severity    error
  description "Access env vars through src/config only — never process.env directly"
  forbid pattern "process.env."
  in layers   [actions, hooks, components, app]
}

rule "no-next-router" {
  severity    error
  description "Use next/navigation not next/router in App Router"
  forbid import "next/router"
  except in   []
}

rule "no-any" {
  severity    warning
  description "No TypeScript any — define proper types in src/types"
  forbid pattern ": any"
  in layers   [types, actions, lib, hooks]
}

rule "no-console" {
  severity    warning
  description "Remove console.log statements before committing"
  forbid pattern "console.log"
  in layers   [components, hooks, app, actions]
}

enforce no-circular-imports
enforce no-dead-exports

flow auth {
  description "Google OAuth → Supabase creates auth.users → DB trigger creates profiles row"
  steps [
    "user clicks Sign In with Google"
    "Supabase Auth redirects to Google OAuth"
    "Google redirects back to /api/auth/callback"
    "Supabase session established"
    "DB trigger fires: creates public.profiles row"
    "user redirected to dashboard"
  ]
  touches [
    "src/lib/supabase.ts"
    "src/app/api/auth/callback/route.ts"
    "src/app/(auth)/login/page.tsx"
  ]
  tables  ["auth.users", "public.profiles"]
  fields  ["profiles.user_id", "profiles.email", "profiles.username"]
}

flow payment {
  description "Polar checkout → webhook → profiles.is_paid = true → access unlocked"
  steps [
    "user visits /upgrade"
    "user clicks Buy"
    "redirect to Polar.sh checkout"
    "user completes payment"
    "Polar POSTs webhook to /api/webhooks/polar"
    "webhook verifies Polar signature"
    "calls actions/payments.ts updatePaymentStatus()"
    "prisma sets profiles.is_paid = true"
    "protected routes now accessible"
  ]
  touches [
    "src/app/api/webhooks/polar/route.ts"
    "src/lib/polar.ts"
    "src/actions/payments.ts"
    "src/app/(marketing)/upgrade/page.tsx"
  ]
  tables  ["public.profiles"]
  fields  [
    "profiles.is_paid"
    "profiles.polar_customer_id"
    "profiles.purchased_at"
    "profiles.current_plan"
  ]
}

flow notes {
  description "Full note CRUD: component → server action → Prisma → Supabase Postgres"
  steps [
    "component calls server action"
    "action validates auth session"
    "action calls prisma with validated user_id"
    "Prisma executes query against Supabase Postgres"
    "result returned to component"
  ]
  touches [
    "src/actions/notes.ts"
    "src/hooks/useNotes.ts"
    "src/components/app/NoteEditor.tsx"
    "src/components/app/NoteList.tsx"
  ]
  tables  [
    "public.notes"
    "public.note_versions"
    "public.notes_history_snapshots"
  ]
  fields  [
    "notes.user_id"
    "notes.title"
    "notes.content"
    "notes.tags"
    "notes.is_pinned"
    "notes.is_public"
    "notes.linked_notes"
  ]
}

flow access-control {
  description "Every protected page checks profiles.is_paid before rendering"
  steps [
    "user navigates to route under (protected)/"
    "layout.tsx runs on server"
    "calls getProfile() server action"
    "checks profile.is_paid"
    "if false: redirect('/upgrade')"
    "if true: render page"
  ]
  touches [
    "src/app/(protected)/layout.tsx"
    "src/actions/profiles.ts"
  ]
  fields  ["profiles.is_paid"]
}

convention action    "src/actions/{domain}.ts"
convention hook      "src/hooks/use{Name}.ts"
convention component "src/components/app/{Name}.tsx"
convention api-route "src/app/api/{path}/route.ts"
convention page      "src/app/{path}/page.tsx"
convention layout    "src/app/{path}/layout.tsx"

context {
  summary """
    Next.js 14 note-taking app. App Router. TypeScript strict mode.

    Auth: Supabase Google OAuth. After sign-in, DB trigger auto-creates
    public.profiles row linked to auth.users.

    Payments: Polar.sh (sandbox). User pays → Polar webhook →
    /api/webhooks/polar → profiles.is_paid = true.
    Protected pages gate on this boolean via (protected)/layout.tsx.

    Database: Supabase Postgres. Accessed exclusively via Prisma ORM.
    Never import @prisma/client outside src/lib or src/actions.
    Never query DB from components.

    UI: shadcn/ui (src/components/ui — never touch) + Tailwind CSS.
    Custom app components in src/components/app.

    Architecture: types → config → lib → actions/hooks → components → app.
  """

  critical-files [
    "project.arc"
    "prisma/schema.prisma"
    "src/types/index.ts"
    "src/config/index.ts"
    "src/lib/db.ts"
    "src/lib/supabase.ts"
    "src/lib/polar.ts"
    "src/actions/notes.ts"
    "src/actions/profiles.ts"
    "src/actions/payments.ts"
    "src/app/(protected)/layout.tsx"
    "src/app/api/webhooks/polar/route.ts"
  ]

  do-not-touch [
    "src/components/ui/"
    "prisma/schema.prisma (auth schema models)"
  ]
}
```

---

## 9. Integration into Next.js App

### 9.1 Add `arc-cli` to the project

Place `arc-cli/` at project root.

Add to `package.json`:

```json
{
  "scripts": {
    "dev":          "next dev",
    "build":        "npm run arc:check && next build",
    "arc:check":    "node arc-cli/arc.js check",
    "arc:map":      "node arc-cli/arc.js map",
    "arc:print":    "node arc-cli/arc.js print",
    "arc:scaffold": "node arc-cli/arc.js scaffold"
  }
}
```

### 9.2 `.gitignore`

```gitignore
# Architecture map (auto-generated — commit or ignore, your choice)
.arc/CODEBASE.md
```

### 9.3 Daily workflow

```bash
arc check                         # check architecture (auto on npm run build)
arc map                           # regenerate .arc/CODEBASE.md
arc print                         # see full architecture at a glance
arc scaffold action payments      # create src/actions/payments.ts
arc scaffold hook Profile         # create src/hooks/useProfile.ts
arc scaffold component NoteCard   # create src/components/app/NoteCard.tsx
```

### 9.4 Using with AI

Paste `project.arc` at the start of any AI coding session.
The AI instantly knows: your layers, import rules, data flows, conventions, critical files, and what not to touch — without reading your entire codebase.

---

## 10. Implementation Order

Implement strictly in this order. Do not skip ahead.

```md
Phase 1 — Core modules
  1.  lexer.js          tokenize() function
  2.  parser.js         Parser class with all parseX methods
  3.  graph.js          buildGraph() and detectCycles()
  4.  checker.js        Checker class — all 7 passes
  5.  mapper.js         Mapper class — generate() and write()
  6.  scaffold.js       scaffold() function — all templates
  7.  templates.js      all 6 built-in preset strings
  8.  arc.js            CLI entry — all 6 commands

Phase 2 — Validation
  9.  Parse the project.arc from Section 8 without errors
  10. arc print         runs cleanly, shows all 8 layers
  11. arc check clean   exits 0 on clean codebase
  12. arc check errors  catches all 3 violation types:
                        import-boundary, missing-directive, filename-convention
  13. arc check rules   catches forbidden import, pattern, package violations
  14. arc check exports detects wrong export shapes per layer
  15. arc check cycles  detects A→B→A circular imports
  16. arc map           generates valid CODEBASE.md with all sections
  17. arc scaffold      creates correct file with correct template
  18. arc init nextjs   creates project.arc from nextjs template

Phase 3 — VS Code Extension
  19. package.json              extension manifest
  20. language-configuration.json
  21. syntaxes/arc.tmLanguage.json
  22. Test in VS Code: open project.arc, verify all token colors correct
```

---

## 11. Acceptance Criteria

### arc-cli

- [ ] `node arc-cli/arc.js help` prints full usage
- [ ] `arc print` parses `project.arc` and shows layers, rules, enforcements, flows, conventions
- [ ] `arc check` exits `0` on a clean codebase
- [ ] `arc check` exits `1` and shows file + line for each error
- [ ] `arc check` exits `0` when only warnings exist
- [ ] `arc check` detects import boundary violations (Pass 1)
- [ ] `arc check` detects missing directives (Pass 2)
- [ ] `arc check` detects filename pattern violations (Pass 3)
- [ ] `arc check` detects forbidden import/pattern/package rule violations (Pass 4)
- [ ] `arc check` detects wrong export shapes (Pass 5)
- [ ] `arc check` detects circular imports when `enforce no-circular-imports` set (Pass 6)
- [ ] `arc check` detects dead exports when `enforce no-dead-exports` set (Pass 7)
- [ ] `arc map` creates `.arc/CODEBASE.md` with all 10 required sections
- [ ] `arc scaffold action payments` creates `src/actions/payments.ts` with `'use server'`
- [ ] `arc scaffold hook Notes` creates `src/hooks/useNotes.ts` with `'use client'`
- [ ] `arc scaffold component NoteCard` creates `src/components/app/NoteCard.tsx`
- [ ] `arc init nextjs` creates `project.arc` from nextjs template
- [ ] `arc init` with no args lists all 6 templates
- [ ] Zero npm dependencies — runs on Node ≥ 18 with no install
- [ ] Parse errors include line number
- [ ] Missing `project.arc` shows helpful message, not a crash

### VS Code Extension

- [ ] `.arc` files are recognized and highlighted automatically
- [ ] Block keywords (`arc`, `layer`, `rule`, `flow`, `convention`, `context`, `enforce`) appear in keyword color
- [ ] Field keywords (`path`, `description`, `can`, `require`, etc.) appear in a distinct support color
- [ ] `error` / `warning` appear as constants
- [ ] `async-function`, `type`, `interface`, etc. appear as type values
- [ ] `no-circular-imports` etc. appear as language variables
- [ ] Strings appear in string color
- [ ] `"""..."""` multiline strings highlighted as strings
- [ ] `#` comments appear in comment color
- [ ] Block name after `layer`/`rule`/`flow` highlighted as entity name
- [ ] Bracket matching works for `{}` and `[]`
- [ ] `Cmd+/` toggles `#` line comment
- [ ] Auto-indent on `{` and de-indent on `}`

### Integration

- [ ] `npm run build` in the Next.js app runs `arc check` first
- [ ] A violation causes `npm run build` to fail with a clear message
- [ ] `project.arc` accurately represents the actual codebase structure

---

## Appendix A — All Violation Message Formats

```md
# Pass 1 — Import boundary
src/components/app/NoteList.tsx:1
└─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

# Pass 2 — Missing directive
src/hooks/useNotes.ts
└─ [missing-directive] Missing "use client" — required in [hooks] layer

# Pass 3 — Filename convention
src/hooks/fetchNotes.ts
└─ [filename-convention] File "fetchNotes.ts" does not match required pattern "use*.ts" in [hooks]

# Pass 4 — Custom rule (import)
src/components/app/NoteList.tsx:3
└─ [no-prisma-in-components] Prisma can only be used in lib and actions layers

# Pass 4 — Custom rule (pattern)
src/actions/notes.ts:47
└─ [no-any-types] Avoid 'any' — found ": any"

# Pass 5 — Export shape
src/types/index.ts:12
└─ [export-shape] [types] forbids function exports — found "export function formatDate"

# Pass 6 — Circular import
└─ [circular-import] Circular import: src/hooks/useNotes.ts → src/actions/notes.ts → src/hooks/useNotes.ts

# Pass 7 — Dead export
src/utils/format.ts:8
└─ [dead-export] "formatTimestamp" is exported but never imported anywhere
```

---

## Appendix B — Error Message Formats

```md
# Parser errors
[arc parser] Line 42: expected STRING but got KEYWORD ("layer")
[arc parser] Line 7: expected "}" but got EOF

# File not found
✗  No project.arc found in /Users/khagan/note-app

  Run arc init to create one, or arc init nextjs for a template.

# Parse failure
✗  Failed to parse project.arc

  [arc parser] Line 14: expected STRING but got KEYWORD ("layer")
```

---

*End of specification.*
*Deliverables: 1 DSL (`.arc`), 1 compiler (8 JS modules), 1 CLI (6 commands), 1 VS Code extension, 6 template presets, 1 production `project.arc`.*
*Zero npm dependencies. Pure Node.js ≥ 18. No build step.*
