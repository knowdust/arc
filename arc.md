# ARCH — Build Specification

## Architecture Compiler + `.arch` DSL + VS Code Highlighter

> **This document is a complete build spec for GitHub Copilot.**
> Read every section before writing a single line of code.
> Every decision is made here — Copilot implements, does not design.

---

## Table of Contents

1. [What You Are Building](#1-what-you-are-building)
2. [Repository Structure](#2-repository-structure)
3. [The `.arch` DSL — Full Language Spec](#3-the-arch-dsl--full-language-spec)
4. [Compiler Pipeline](#4-compiler-pipeline)
5. [CLI Tool — Full Spec](#5-cli-tool--full-spec)
6. [VS Code Extension — Syntax Highlighter](#6-vs-code-extension--syntax-highlighter)
7. [The `project.arch` File for This Codebase](#7-the-projectarch-file-for-this-codebase)
8. [Integration into Next.js App](#8-integration-into-nextjs-app)
9. [Implementation Order](#9-implementation-order)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. What You Are Building

Three things that work together:

```md
project.arch          ← the DSL file (human writes this)
     │
     ▼
arch CLI              ← compiler (lexer → parser → checker → mapper)
  arch check          ← enforces rules, exits 1 on violation
  arch map            ← generates .arch/CODEBASE.md
  arch print          ← pretty-prints parsed arch
  arch scaffold       ← generates files following conventions
     │
     ▼
VS Code Extension     ← syntax highlighting for .arch files
```

**The mental model:**

- `prisma/schema.prisma` is the single source of truth for the **database**
- `project.arch` is the single source of truth for the **architecture**
- `arch check` is to architecture what `tsc` is to types — it fails the build on violations
- The VS Code extension makes `project.arch` as pleasant to write as `schema.prisma`

**Tech stack this targets:**

- Next.js 14 App Router
- Supabase (Postgres + Auth)
- Prisma ORM
- Polar.sh payments
- shadcn/ui + Tailwind
- TypeScript

---

## 2. Repository Structure

```md
arch-cli/                          ← root of the arch-cli tool
├── arch.js                        ← CLI entry point (#!/usr/bin/env node)
├── lexer.js                       ← tokenizer
├── parser.js                      ← AST builder
├── checker.js                     ← rule enforcer
├── mapper.js                      ← CODEBASE.md generator
├── scaffold.js                    ← file scaffolder
├── package.json
├── README.md
└── project.arch                   ← example/default arch file

arch-vscode/                       ← VS Code extension root
├── package.json                   ← extension manifest
├── syntaxes/
│   └── arch.tmLanguage.json       ← TextMate grammar
├── language-configuration.json    ← bracket matching, comments
└── README.md
```

Everything in `arch-cli/` is **zero npm dependencies** — pure Node.js built-ins only (`fs`, `path`).
The VS Code extension has zero runtime dependencies.

---

## 3. The `.arch` DSL — Full Language Spec

### 3.1 Overview

The `.arch` file is a custom DSL. It is **not** JSON, YAML, or TOML.
It has its own syntax inspired by Prisma's schema language — block-based, expressive, readable.

File extension: `.arch`
Conventional filename: `project.arch` (at project root)
Encoding: UTF-8
Line comments: `#`

### 3.2 Complete Syntax Reference

```md
# ── Top-level blocks ──────────────────────────────────────────

arch "<name>" {
  version  "<semver>"
  stack    <id> + <id> + <id> ...
  language <id>
}

layer <name> {
  path        "<relative-path>"
  description "<string>"
  can import  [<layer-name>, ...]
  require directive "<string>"         # optional
  readonly                             # optional flag
}

rule "<id>" {
  severity    error | warning
  description "<string>"
  forbid import "<module-pattern>"     # OR
  forbid pattern "<code-pattern>"
  except in   [<layer-name>, ...]      # used with forbid import
  in layers   [<layer-name>, ...]      # used with forbid pattern
}

flow <name> {
  description "<string>"
  steps   ["<string>", ...]
  touches ["<path>", ...]
  tables  ["<table>", ...]
  fields  ["<field>", ...]
}

convention <name> "<pattern>"

context {
  summary """
    <multiline string>
  """
  critical-files ["<path>", ...]
  do-not-touch   ["<path>", ...]
}
```

### 3.3 Token Types

The lexer must produce exactly these token types:

| Token | Description | Examples |
| --- | --- | --- |
| `KEYWORD` | Reserved words | `arch`, `layer`, `rule`, `flow`, `convention`, `context`, `version`, `stack`, `language`, `path`, `description`, `can`, `import`, `require`, `directive`, `readonly`, `severity`, `forbid`, `pattern`, `except`, `in`, `steps`, `touches`, `tables`, `fields`, `layers`, `summary`, `critical-files`, `do-not-touch`, `error`, `warning` |
| `STRING` | Double-quoted single-line | `"src/actions"` |
| `MULTILINE_STRING` | Triple-quoted | `"""..."""` |
| `IDENTIFIER` | Unquoted names | `nextjs`, `notes`, `auth-flow` |
| `LBRACE` | `{` | |
| `RBRACE` | `}` | |
| `LBRACKET` | `[` | |
| `RBRACKET` | `]` | |
| `PLUS` | `+` | stack declarations |
| `EOF` | End of file | |

Comments (`# ...`) are consumed and discarded by the lexer.
Whitespace and newlines are consumed and discarded by the lexer.
Multiline strings preserve internal whitespace, trim leading/trailing.

### 3.4 AST Node Types

```javascript
// The complete AST shape the parser must produce:

{
  project: {
    name:     string,
    version:  string,
    stack:    string[],
    language: string,
  } | null,

  layers: [{
    name:       string,       // e.g. "actions"
    path:       string,       // e.g. "src/actions"
    description: string,
    canImport:  string[],     // layer names
    directive:  string | null, // e.g. "use server"
    readonly:   boolean,
  }],

  rules: [{
    id:          string,
    severity:    "error" | "warning",
    description: string,
    forbidType:  "import" | "pattern",
    forbidValue: string,
    exceptIn:    string[],    // layer names
    inLayers:    string[],    // layer names
  }],

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

- Blocks can appear in any order
- Multiple `layer`, `rule`, `flow`, `convention` blocks are allowed
- Only one `arch` block and one `context` block allowed per file
- Unknown keywords inside blocks are silently skipped (forward compatibility)
- Parser errors must include line number and token that caused the failure
- Empty string lists `[]` are valid

### 3.6 Example `.arch` File

This is the canonical example for this codebase. It must parse without errors.

```md
# project.arch
# Architecture source of truth — like schema.prisma but for your codebase

arch "note-app" {
  version  "1.0.0"
  stack    nextjs + supabase + prisma + polar + shadcn + tailwind
  language typescript
}

# ── Layers ────────────────────────────────────────────────────

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
  description "Server actions. All DB access lives here."
  can import  [types, lib]
  require directive "use server"
}

layer hooks {
  path        "src/hooks"
  description "React hooks. Client-side only."
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
  description "Next.js pages and API routes."
  can import  [types, hooks, components, actions, lib]
}

# ── Rules ─────────────────────────────────────────────────────

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

convention server-action  "src/actions/{domain}.ts"
convention hook           "src/hooks/use{Name}.ts"
convention component      "src/components/app/{Name}.tsx"
convention api-route      "src/app/api/{path}/route.ts"
convention page           "src/app/{path}/page.tsx"

# ── Context ───────────────────────────────────────────────────

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
```

---

## 4. Compiler Pipeline

```md
project.arch (raw text)
       │
       ▼
  ┌─────────┐
  │  lexer  │  source → Token[]
  └─────────┘
       │
       ▼
  ┌─────────┐
  │ parser  │  Token[] → ArchAST
  └─────────┘
       │
       ├──────────────────────┐
       ▼                      ▼
  ┌─────────┐           ┌─────────┐
  │ checker │           │ mapper  │
  │ (check) │           │  (map)  │
  └─────────┘           └─────────┘
       │                      │
       ▼                      ▼
  Violation[]          CODEBASE.md
```

### 4.1 `lexer.js`

**Input:** raw string (file contents)
**Output:** `Token[]`

```javascript
// Public API
function tokenize(source) → Token[]

// Token shape
{ type: string, value: string, line: number, col: number }
```

**Rules:**

- Single-pass character iterator — no regex on full source
- Track `line` and `col` for every token
- Discard comments and whitespace (do not emit tokens)
- `"""..."""` multiline strings: trim leading/trailing whitespace from content
- `+` in stack declarations emitted as its own `PLUS` token
- Any unrecognized character: skip silently

### 4.2 `parser.js`

**Input:** `Token[]`
**Output:** `ArchAST`

```javascript
// Public API — exported as class
class Parser {
  constructor(tokens)
  parse() → ArchAST
}
```

**Rules:**

- Recursive descent parser — one method per block type
- On unexpected token: throw `Error` with line number included in message
- `eatIf(type, value)` helper — consume token if it matches, else no-op
- `expect(type, value?)` helper — consume or throw
- Block-level parse methods: `parseProject`, `parseLayer`, `parseRule`, `parseFlow`, `parseConvention`, `parseContext`

### 4.3 `checker.js`

**Input:** `ArchAST`, `cwd` (project root string)
**Output:** `Violation[]`

```javascript
// Public API
class Checker {
  constructor(ast, cwd)
  run() → Violation[]
}

// Violation shape
{
  severity: "error" | "warning",
  rule:     string,
  file:     string,   // relative path
  line:     number | undefined,
  message:  string,
}
```

**Three check passes (run in order):**

**Pass 1 — Import Boundaries**
For every non-readonly layer:

- Walk all `.ts` and `.tsx` files under `layer.path`
- For each line matching `/from\s+['"](@\/[^'"]+)['"]/`
- Resolve `@/` to `src/`
- Check if resolved path falls inside another layer's `path`
- If that other layer is not in `canImport` → violation with `rule: "import-boundary"`

**Pass 2 — Required Directives**
For every layer with a `directive`:

- Walk all `.ts` and `.tsx` files under `layer.path`
- Check if file content includes `"use server"` or `'use server'` (or whichever directive)
- If missing → violation with `rule: "missing-directive"`, severity `error`

**Pass 3 — Custom Rules**
For each rule in `ast.rules`:

If `forbidType === "import"`:

- For every layer NOT in `exceptIn`
- Walk files in that layer
- Check each line for the import pattern (the `forbidValue` string)
- If an import line contains `forbidValue` → violation

If `forbidType === "pattern"`:

- If `inLayers` is non-empty: only check those layers
- Else: check all layers
- Walk files, check each non-comment line for `forbidValue` substring
- If found → violation

**File walking rules:**

- Recurse into subdirectories
- Only check files matching `/\.(ts|tsx|js|jsx)$/`
- Skip files/dirs starting with `.` and `node_modules` and `.next`
- Return relative paths (from cwd), forward-slash normalized

### 4.4 `mapper.js`

**Input:** `ArchAST`, `cwd`
**Output:** writes `.arch/CODEBASE.md`

```javascript
class Mapper {
  constructor(ast, cwd)
  generate() → string    // returns markdown string
  write()                // writes to .arch/CODEBASE.md
}
```

**The generated `CODEBASE.md` must contain (in order):**

1. Header with generation timestamp and `arch map` reminder
2. Project block (name, version, stack, language)
3. AI Summary from context block
4. Critical files list
5. Do-not-touch list
6. Layers table: `Layer | Path | Can Import From | File Count`
7. Layer descriptions with directive and readonly annotations
8. Data flows section — each flow with description, numbered steps, files, tables, fields
9. Rules table: `ID | Severity | Description`
10. Naming conventions table
11. File tree of `src/` using `📁` and `📄` emoji

**File counting:** count only `.ts` and `.tsx` files in the layer's path recursively.

### 4.5 `scaffold.js`

**Input:** CLI args (type, name)
**Output:** creates a new file

```javascript
// Public API
function scaffold(ast, cwd, type, name) → void
```

**Supported types and their templates:**

`action <domain>` → `src/actions/{domain}.ts`

```typescript
'use server'
import { prisma } from '@/lib/db'
import type { ActionResult } from '@/types'

export async function get{Domain}(): Promise<ActionResult<any>> {
  try {
    return { success: true, data: null }
  } catch (error) {
    return { success: false, error: 'Failed' }
  }
}
```

`hook <Name>` → `src/hooks/use{Name}.ts`

```typescript
'use client'
import { useState, useEffect } from 'react'

export function use{Name}() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // TODO
  }, [])

  return { data, loading, error }
}
```

`component <Name>` → `src/components/app/{Name}.tsx`

```typescript
type {Name}Props = {
  // TODO
}

export function {Name}({}: {Name}Props) {
  return (
    <div>
      {/* TODO */}
    </div>
  )
}
```

**Error if file already exists. Create parent directories recursively.**

---

## 5. CLI Tool — Full Spec

### 5.1 Entry Point

File: `arch.js`
Shebang: `#!/usr/bin/env node`
Mode: `'use strict'`
Zero npm dependencies — only `require('fs')` and `require('path')` and local modules.

### 5.2 Commands

```md
arch check            Validate codebase against project.arch
arch map              Generate .arch/CODEBASE.md
arch print            Pretty-print parsed project.arch to terminal
arch scaffold <type> <name>   Create a new file following conventions
arch help             Print help
```

### 5.3 `arch check` — Detailed Behavior

```md
◆ arch check

  Parsed project.arch — 7 layers, 5 rules

  ⚠  1 warning:

  src/components/app/Widget.tsx:3
  └─ [no-console-in-production] Remove console.log before shipping — found "console.log"

  ✗  2 errors:

  src/components/app/NoteList.tsx:1
  └─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

  src/hooks/useNotes.ts
  └─ [missing-directive] Missing "use client" — required in [hooks] layer

  Architecture check failed.
```

- Print warnings first, then errors
- Each violation: filename (with line if known), then indented `└─ [rule-id] message`
- Exit code `0` if only warnings or no violations
- Exit code `1` if any errors
- If no `project.arch` found: print clear message, exit `1`
- If parse fails: print error with line number, exit `1`

### 5.4 `arch map` — Detailed Behavior

```md
◆ arch map

  ✓  Generated .arch/CODEBASE.md

  Tip: paste project.arch into Claude or Cursor for instant full context.
```

- Creates `.arch/` directory if it doesn't exist
- Overwrites existing `CODEBASE.md`
- Exit `0` always (unless parse fails)

### 5.5 `arch print` — Detailed Behavior

```md
◆ arch print

  note-app v1.0.0
  nextjs + supabase + prisma + polar + shadcn + tailwind · typescript

  Layers (7)
  types             src/types
                    imports: none
  lib               src/lib
                    imports: types
  actions           src/actions
                    imports: types, lib  |  requires: "use server"
  hooks             src/hooks
                    imports: types, lib  |  requires: "use client"
  components        src/components/app
                    imports: types, hooks, lib
  ui                src/components/ui
                    imports: types  |  readonly
  app               src/app
                    imports: types, hooks, components, actions, lib

  Rules (5)
  error    no-prisma-outside-lib-actions
           Prisma can only be used in lib and actions layers
  warning  no-any-types
           Avoid 'any' — use proper types from src/types

  Flows (4)
  auth                  Google OAuth → Supabase creates auth.users...
  payment               Polar checkout → webhook → profiles.is_paid...
  notes                 Authenticated user CRUD on notes via server actions...
  access-control        Protected pages check profiles.is_paid...

  Conventions (5)
  server-action         src/actions/{domain}.ts
  hook                  src/hooks/use{Name}.ts
```

### 5.6 `arch scaffold` — Detailed Behavior

```md
$ arch scaffold action payments

  ✓  Created src/actions/payments.ts
```

```md
$ arch scaffold hook Profile

  ✓  Created src/hooks/useProfile.ts
```

### 5.7 ANSI Color Scheme

Use raw ANSI escape codes — no chalk dependency.

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

Color assignments:

- Command headers (`◆ arch check`): bold blue
- Success (`✓`): green
- Warnings (`⚠`): yellow
- Errors (`✗`): red
- Layer/rule names: cyan
- Paths and secondary info: dim
- File paths with violations: red (errors) or yellow (warnings)
- `└─` lines: dim

### 5.8 `package.json`

```json
{
  "name": "arch-cli",
  "version": "1.0.0",
  "description": "Architecture compiler — enforces codebase rules from a project.arch file",
  "main": "arch.js",
  "bin": {
    "arch": "./arch.js"
  },
  "scripts": {
    "test": "node arch.js help"
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
  "name": "arch-language",
  "displayName": "arch — Architecture DSL",
  "description": "Syntax highlighting for .arch architecture definition files",
  "version": "1.0.0",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Programming Languages"],
  "contributes": {
    "languages": [{
      "id": "arch",
      "aliases": ["Arch", "arch"],
      "extensions": [".arch"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "arch",
      "scopeName": "source.arch",
      "path": "./syntaxes/arch.tmLanguage.json"
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
    { "open": "\"", "close": "\"" },
    { "open": "\"\"\"", "close": "\"\"\"" }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["\"", "\""]
  ]
}
```

### 6.3 TextMate Grammar (`syntaxes/arch.tmLanguage.json`)

The grammar must produce these visual results in VS Code:

| Element | Expected Color (scope) |
| --- | --- |
| `#` comments | Comment (green in most themes) |
| Block keywords: `arch`, `layer`, `rule`, `flow`, `convention`, `context` | Keyword / purple |
| Field keywords: `path`, `description`, `can`, `import`, `require`, `directive`, `readonly`, `severity`, `forbid`, `pattern`, `except`, `in`, `steps`, `touches`, `tables`, `fields`, `layers`, `summary`, `critical-files`, `do-not-touch`, `version`, `stack`, `language` | Support / teal |
| Values: `error`, `warning` | Constant / orange |
| `+` in stack declarations | Operator |
| Double-quoted strings `"..."` | String / yellow/orange |
| Triple-quoted strings `"""..."""` | String (multiline) |
| Block names (after `layer`, `rule`, etc.) | Entity name / blue |
| `[`, `]`, `{`, `}` | Punctuation |

```json
{
  "name": "arch",
  "scopeName": "source.arch",
  "fileTypes": ["arch"],
  "patterns": [
    { "include": "#comments" },
    { "include": "#multiline-strings" },
    { "include": "#block-definitions" },
    { "include": "#field-keywords" },
    { "include": "#value-keywords" },
    { "include": "#strings" },
    { "include": "#operators" },
    { "include": "#punctuation" }
  ],
  "repository": {
    "comments": {
      "name": "comment.line.number-sign.arch",
      "match": "#.*$"
    },
    "multiline-strings": {
      "name": "string.quoted.triple.arch",
      "begin": "\"\"\"",
      "end": "\"\"\""
    },
    "strings": {
      "name": "string.quoted.double.arch",
      "begin": "\"",
      "end": "\"",
      "patterns": []
    },
    "block-definitions": {
      "patterns": [
        {
          "comment": "arch block — project declaration",
          "match": "\\b(arch)\\b\\s+(\"[^\"]*\")",
          "captures": {
            "1": { "name": "keyword.control.arch" },
            "2": { "name": "entity.name.type.arch" }
          }
        },
        {
          "comment": "layer/rule/flow blocks with name",
          "match": "\\b(layer|rule|flow)\\b\\s+([a-zA-Z][a-zA-Z0-9_\\-]*|\"[^\"]*\")",
          "captures": {
            "1": { "name": "keyword.control.arch" },
            "2": { "name": "entity.name.function.arch" }
          }
        },
        {
          "comment": "standalone block keywords",
          "match": "\\b(convention|context)\\b",
          "name": "keyword.control.arch"
        }
      ]
    },
    "field-keywords": {
      "match": "\\b(path|description|can|import|require|directive|readonly|severity|forbid|pattern|except|in|steps|touches|tables|fields|layers|summary|critical-files|do-not-touch|version|stack|language)\\b",
      "name": "support.function.arch"
    },
    "value-keywords": {
      "match": "\\b(error|warning)\\b",
      "name": "constant.language.arch"
    },
    "operators": {
      "match": "\\+",
      "name": "keyword.operator.arch"
    },
    "punctuation": {
      "patterns": [
        { "match": "[{}]", "name": "punctuation.section.arch" },
        { "match": "[\\[\\]]", "name": "punctuation.definition.arch" }
      ]
    }
  }
}
```

### 6.4 Installing the Extension

```bash
# Option 1: install from folder during development
# In VS Code: Cmd+Shift+P → "Developer: Install Extension from Location"
# Select the arch-vscode/ folder

# Option 2: package and install
cd arch-vscode
npx vsce package     # produces arch-language-1.0.0.vsix
code --install-extension arch-language-1.0.0.vsix
```

---

## 7. The `project.arch` File for This Codebase

This is the `project.arch` to place at the root of the Next.js note-taking app.
It reflects the actual codebase structure. Copy verbatim.

```md
# project.arch
# Single source of truth for codebase architecture
# Run: arch check   → enforce rules
# Run: arch map     → generate .arch/CODEBASE.md

arch "note-app" {
  version  "1.0.0"
  stack    nextjs + supabase + prisma + polar + shadcn + tailwind
  language typescript
}

layer types {
  path        "src/types"
  description "All TypeScript types. No logic, no side effects."
  can import  []
}

layer lib {
  path        "src/lib"
  description "Prisma client, Supabase client, Polar helpers. Pure infrastructure."
  can import  [types]
}

layer actions {
  path        "src/actions"
  description "Server actions. Only place DB queries live. Never called client-side directly."
  can import  [types, lib]
  require directive "use server"
}

layer hooks {
  path        "src/hooks"
  description "React hooks. Client-side state and data fetching. No direct DB access."
  can import  [types, lib]
  require directive "use client"
}

layer components {
  path        "src/components/app"
  description "App UI components. No Prisma, no Supabase, no direct DB access."
  can import  [types, hooks, lib]
}

layer ui {
  path        "src/components/ui"
  description "shadcn/ui components. Auto-generated. Never manually edit these files."
  can import  [types]
  readonly
}

layer app {
  path        "src/app"
  description "Next.js App Router pages, layouts, and API routes."
  can import  [types, hooks, components, actions, lib]
}

rule "no-prisma-outside-lib-actions" {
  severity    error
  description "Prisma client can only be imported in src/lib and src/actions"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

rule "no-supabase-ssr-in-client-layers" {
  severity    error
  description "Supabase SSR server client cannot be used in components or hooks"
  forbid import "@supabase/ssr"
  except in   [lib, actions, app]
}

rule "no-db-client-in-components" {
  severity    error
  description "Components must not import prisma db client directly — use actions"
  forbid import "@/lib/db"
  except in   [actions, lib]
}

rule "no-polar-direct-in-components" {
  severity    error
  description "Polar payment logic must stay in lib/actions — not in components"
  forbid import "@/lib/polar"
  except in   [actions, lib, app]
}

rule "no-any-types" {
  severity    warning
  description "Avoid TypeScript 'any' — define proper types in src/types"
  forbid pattern ": any"
  in layers   [actions, lib, types, hooks]
}

rule "no-console-logs" {
  severity    warning
  description "Remove console.log statements before committing"
  forbid pattern "console.log"
  in layers   [components, hooks, app, actions]
}

flow auth {
  description "Google OAuth → Supabase creates auth.users → DB trigger creates profiles row"
  steps [
    "user clicks Sign In with Google"
    "Supabase Auth redirects to Google OAuth"
    "Google redirects to /api/auth/callback"
    "Supabase session established"
    "DB trigger fires: creates public.profiles row from auth.users"
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
  description "Polar checkout → webhook → profiles.is_paid = true → protected pages unlock"
  steps [
    "user visits /upgrade page"
    "user clicks Buy button"
    "redirect to Polar.sh checkout (sandbox)"
    "user completes payment on Polar"
    "Polar POSTs webhook to /api/webhooks/polar"
    "webhook handler verifies Polar signature"
    "calls actions/payments.ts updatePaymentStatus()"
    "prisma: profiles.is_paid = true, purchased_at = now()"
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
  description "Full CRUD on notes — component → server action → Prisma → Supabase Postgres"
  steps [
    "component calls server action (e.g. createNote, updateNote)"
    "action validates auth session via Supabase"
    "action calls prisma with validated user_id"
    "Prisma executes query against Supabase Postgres"
    "result returned to component"
    "component re-renders with new data"
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
    "user navigates to protected route under (protected)/"
    "layout.tsx runs on server"
    "calls getProfile() server action"
    "checks profile.is_paid boolean"
    "if false: redirect('/upgrade')"
    "if true: render page normally"
  ]
  touches [
    "src/app/(protected)/layout.tsx"
    "src/actions/profiles.ts"
  ]
  fields  ["profiles.is_paid"]
}

convention server-action  "src/actions/{domain}.ts"
convention hook           "src/hooks/use{Name}.ts"
convention component      "src/components/app/{Name}.tsx"
convention api-route      "src/app/api/{path}/route.ts"
convention page           "src/app/{path}/page.tsx"
convention layout         "src/app/{path}/layout.tsx"

context {
  summary """
    Next.js 14 note-taking app. App Router. TypeScript strict mode.

    Auth: Supabase Google OAuth. After sign-in, a DB trigger automatically
    creates a row in public.profiles linked to auth.users.

    Payments: Polar.sh (sandbox). User pays → Polar webhook fires →
    /api/webhooks/polar updates profiles.is_paid = true.
    All protected pages gate on this boolean via layout.tsx.

    Database: Supabase Postgres. Accessed exclusively via Prisma ORM.
    Never import @prisma/client outside of src/lib or src/actions.
    Never query the DB from components directly.

    UI: shadcn/ui (src/components/ui — never touch) + Tailwind CSS.
    Custom components live in src/components/app.

    Architecture: strict layered — types → lib → actions → hooks/components → app.
    Server actions in src/actions. Client hooks in src/hooks.
    All types centralized in src/types/index.ts.
  """

  critical-files [
    "project.arch"
    "prisma/schema.prisma"
    "src/types/index.ts"
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

## 8. Integration into Next.js App

### 8.1 Add `arch-cli` as a local tool

Copy the `arch-cli/` folder into your project root.

Add to `package.json` scripts:

```json
{
  "scripts": {
    "dev":         "next dev",
    "build":       "npm run arch:check && next build",
    "arch:check":  "node arch-cli/arch.js check",
    "arch:map":    "node arch-cli/arch.js map",
    "arch:print":  "node arch-cli/arch.js print",
    "arch:new":    "node arch-cli/arch.js scaffold"
  }
}
```

### 8.2 Add `.arch/` to `.gitignore` (optional)

```md
# Architecture map (auto-generated)
.arch/CODEBASE.md
```

Or commit it — it's useful for PR context and onboarding.

### 8.3 Daily workflow

```bash
# Before every build (automatic via prebuild):
npm run arch:check

# Regenerate codebase map:
npm run arch:map

# Scaffold a new server action:
npm run arch:new action profiles

# Scaffold a new hook:
npm run arch:new hook Notes

# Scaffold a new component:
npm run arch:new component NoteCard

# See your architecture at a glance:
npm run arch:print
```

### 8.4 Using with AI (Claude, Cursor, Copilot)

When starting any AI-assisted coding session, paste the contents of `project.arch`.
The AI will immediately understand:

- Your full layer structure and what can import what
- Your data flows (auth, payments, notes, access control)
- Your naming conventions
- What files are critical and what to never touch
- Your entire tech stack

This replaces having to explain your codebase every session.

---

## 9. Implementation Order

Implement strictly in this order. Do not skip ahead.

```md
Phase 1 — Core compiler (arch-cli/)
  Step 1.  lexer.js           tokenize() function
  Step 2.  parser.js          Parser class, parse() method
  Step 3.  checker.js         Checker class, run() method
  Step 4.  mapper.js          Mapper class, generate() and write()
  Step 5.  scaffold.js        scaffold() function
  Step 6.  arch.js            CLI entry, all commands
  Step 7.  package.json       bin entry, no deps

Phase 2 — Validation
  Step 8.  Parse the example project.arch without errors
  Step 9.  arch print         runs cleanly
  Step 10. arch check         correctly catches 3 violation types:
                              - import boundary
                              - missing directive
                              - forbidden pattern
  Step 11. arch map           generates valid CODEBASE.md
  Step 12. arch scaffold      creates correct files

Phase 3 — VS Code Extension (arch-vscode/)
  Step 13. package.json       extension manifest
  Step 14. language-configuration.json
  Step 15. syntaxes/arch.tmLanguage.json
  Step 16. Test in VS Code: open project.arch, verify all colors correct
```

---

## 10. Acceptance Criteria

The implementation is complete when all of the following are true:

### arch-cli

- [ ] `node arch-cli/arch.js help` prints usage without error
- [ ] `node arch-cli/arch.js print` parses `project.arch` and prints layers, rules, flows
- [ ] `arch check` exits `0` on a clean codebase
- [ ] `arch check` exits `1` and shows exact file+line for each error when violations exist
- [ ] `arch check` shows warnings but exits `0` when only warnings exist
- [ ] `arch map` creates `.arch/CODEBASE.md` with all required sections
- [ ] `arch scaffold action payments` creates `src/actions/payments.ts` with `'use server'`
- [ ] `arch scaffold hook Notes` creates `src/hooks/useNotes.ts` with `'use client'`
- [ ] `arch scaffold component NoteCard` creates `src/components/app/NoteCard.tsx`
- [ ] No npm dependencies — `node arch-cli/arch.js` works on any machine with Node ≥ 18
- [ ] Parse errors include the line number from the `.arch` file
- [ ] Missing `project.arch` shows a helpful message, not a crash

### VS Code Extension

- [ ] `.arch` files are recognized and highlighted
- [ ] `arch`, `layer`, `rule`, `flow`, `convention`, `context` appear in keyword color
- [ ] Field names (`path`, `description`, `can`, etc.) appear in a distinct color
- [ ] Strings appear in string color
- [ ] `"""..."""` multiline strings are highlighted as strings
- [ ] `#` comments appear in comment color
- [ ] `error` / `warning` values appear in constant/literal color
- [ ] Bracket matching works for `{}` and `[]`
- [ ] `# comment` with `Cmd+/` toggles line comments

### Integration

- [ ] `npm run build` in the Next.js app runs `arch check` first
- [ ] A violation in any file causes `npm run build` to fail with a clear message
- [ ] `project.arch` at the project root parses and represents the actual codebase accurately

---

## Appendix: Error Message Format

All error messages follow this format:

```md
[arch parser] Line 42: expected STRING but got KEYWORD ("layer")
[arch parser] Line 7: expected "}" but got "layer"
```

All violation messages follow this format:

```md
src/components/app/NoteList.tsx:1
└─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

src/hooks/useNotes.ts
└─ [missing-directive] Missing "use client" — required in [hooks] layer

src/actions/payments.ts:15
└─ [no-any-types] Avoid 'any' — use proper types from src/types — found ": any"
```

---

*End of build specification.*
*Total: 1 DSL, 1 compiler (5 modules), 1 CLI, 1 VS Code extension, 1 project.arch.*
*Zero npm dependencies. Pure Node.js. Works anywhere.*
