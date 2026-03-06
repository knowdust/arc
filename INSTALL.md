# arch — Installation & Usage Guide

Complete guide for setting up and using the arch architecture compiler in your Next.js project.

---

## What is arch?

**arch** is an architecture compiler that enforces codebase rules at build time — like TypeScript for your architecture.

```md
schema.prisma    → database structure (Prisma handles this)
project.arch     → architecture structure (arch handles this)
```

Key features:

- ✅ Enforces layer boundaries (what can import what)
- ✅ Validates required directives (`'use server'`, `'use client'`)
- ✅ Forbids specific imports or code patterns
- ✅ Auto-generates architecture documentation
- ✅ Zero npm dependencies

---

## Installation

### Step 1: Copy arch-cli to your project

The `arch-cli/` folder contains all the compiler code. Copy it to your project root:

```bash
# Your project structure should look like:
your-project/
├── arch-cli/              ← the compiler
│   ├── arch.js
│   ├── lexer.js
│   ├── parser.js
│   ├── checker.js
│   ├── mapper.js
│   ├── scaffold.js
│   └── package.json
├── project.arch           ← your architecture definition
├── src/
├── prisma/
└── package.json
```

### Step 2: Create `project.arch`

Create a `project.arch` file at your project root. See the example below or use `docs/arch/project.arch` as a template.

### Step 3: Add scripts to package.json

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "npm run arch:check && next build",
    "arch:check": "node arch-cli/arch.js check",
    "arch:map": "node arch-cli/arch.js map",
    "arch:print": "node arch-cli/arch.js print",
    "arch:new": "node arch-cli/arch.js scaffold"
  }
}
```

Now `npm run build` will fail if you violate any architecture rules!

---

## Commands

### `npm run arch:check`

Validates your entire codebase against the rules in `project.arch`.

```bash
npm run arch:check
```

Example output:

```md
◆ arch check

  Parsed project.arch — 7 layers, 5 rules

  ✗  1 error:

  src/components/app/NoteList.tsx:1
  └─ [import-boundary] [components] cannot import from [actions] → "@/actions/notes"

  Architecture check failed.
```

Exit codes:

- `0` = clean (or only warnings)
- `1` = errors found (blocks build)

### `npm run arch:map`

Generates `.arch/CODEBASE.md` — a complete map of your architecture.

```bash
npm run arch:map
```

The generated markdown includes:

- Project info (name, version, stack)
- Layer structure with import rules
- All architectural rules
- Data flows
- File tree of `src/`

Perfect for:

- Onboarding new developers
- AI context (paste into Claude/Cursor)
- Architecture reviews

### `npm run arch:print`

Pretty-prints your parsed architecture to the terminal.

```bash
npm run arch:print
```

Example output:

```md
◆ arch print

  my-app v1.0.0
  nextjs + typescript + prisma · typescript

  Layers (4)
  types             src/types
                    imports: none
  lib               src/lib
                    imports: types
  actions           src/actions
                    imports: types, lib  |  requires: "use server"
  components        src/components
                    imports: types, lib
```

### `npm run arch:new <type> <name>`

Scaffolds new files following your conventions.

```bash
# Create a server action
npm run arch:new action payments
# → Creates src/actions/payments.ts with 'use server'

# Create a React hook
npm run arch:new hook Notes
# → Creates src/hooks/useNotes.ts with 'use client'

# Create a component
npm run arch:new component NoteCard
# → Creates src/components/app/NoteCard.tsx
```

---

## Example project.arch

```arch
# project.arch — Architecture source of truth

arch "my-app" {
  version  "1.0.0"
  stack    nextjs + typescript + prisma + supabase
  language typescript
}

# ── Layers ────────────────────────────────────────────────────

layer types {
  path        "src/types"
  description "All TypeScript types"
  can import  []
}

layer lib {
  path        "src/lib"
  description "Infrastructure: Prisma, Supabase clients"
  can import  [types]
}

layer actions {
  path        "src/actions"
  description "Server actions — all DB access lives here"
  can import  [types, lib]
  require directive "use server"
}

layer hooks {
  path        "src/hooks"
  description "React hooks — client-side only"
  can import  [types, lib]
  require directive "use client"
}

layer components {
  path        "src/components/app"
  description "App components"
  can import  [types, hooks, lib]
}

layer ui {
  path        "src/components/ui"
  description "shadcn/ui components — never edit"
  can import  [types]
  readonly
}

layer app {
  path        "src/app"
  description "Next.js pages and API routes"
  can import  [types, hooks, components, actions, lib]
}

# ── Rules ─────────────────────────────────────────────────────

rule "no-prisma-in-components" {
  severity    error
  description "Prisma can only be used in lib and actions"
  forbid import "@prisma/client"
  except in   [lib, actions]
}

rule "no-db-in-components" {
  severity    error
  description "Components cannot import db client directly"
  forbid import "@/lib/db"
  except in   [actions, lib]
}

rule "no-console-logs" {
  severity    warning
  description "Remove console.log statements"
  forbid pattern "console.log"
  in layers   [components, hooks, app, actions]
}

# ── Flows ─────────────────────────────────────────────────────

flow auth {
  description "User authentication via Supabase"
  steps [
    "User clicks Sign In"
    "Redirect to auth provider"
    "Callback creates session"
    "Profile row created via trigger"
  ]
  touches ["src/app/api/auth/callback/route.ts", "src/lib/supabase.ts"]
  tables  ["auth.users", "public.profiles"]
}

# ── Conventions ───────────────────────────────────────────────

convention server-action  "src/actions/{domain}.ts"
convention hook           "src/hooks/use{Name}.ts"
convention component      "src/components/app/{Name}.tsx"

# ── Context ───────────────────────────────────────────────────

context {
  summary """
    Next.js 14 note-taking app using TypeScript.
    Auth via Supabase. Data via Prisma ORM.
    Strict layered architecture enforced by arch.
  """
  
  critical-files [
    "project.arch"
    "prisma/schema.prisma"
    "src/types/index.ts"
    "src/lib/db.ts"
  ]
  
  do-not-touch [
    "src/components/ui/"
  ]
}
```

---

## VS Code Extension

Get syntax highlighting for `.arch` files!

### Install

**Option 1: From source** (recommended for development)

1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type: `Developer: Install Extension from Location`
4. Select the `arch-cli/arch-vscode/` folder

**Option 2: Package and install** (advanced)

```bash
cd arch-cli/arch-vscode
npx @vscode/vsce package
code --install-extension arch-language-1.0.0.vsix
```

### Features

- ✅ Syntax highlighting for all `.arch` keywords
- ✅ String highlighting (single and triple-quoted)
- ✅ Comment support with `#`
- ✅ Bracket matching (`{}` and `[]`)
- ✅ Auto-closing pairs

---

## Common Workflows

### Daily development

```bash
# Before committing
npm run arch:check

# If violations found, fix them or adjust project.arch

# Generate fresh docs
npm run arch:map

# Commit both code and project.arch changes
git add project.arch .arch/CODEBASE.md
```

### Adding a new layer

1. Edit `project.arch` and add the layer block
2. Run `npm run arch:print` to verify parsing
3. Run `npm run arch:check` to validate
4. Run `npm run arch:map` to regenerate docs

### Creating new features

```bash
# Scaffold the files
npm run arch:new action users
npm run arch:new hook UserProfile
npm run arch:new component UserCard

# Implement logic

# Validate architecture
npm run arch:check
```

### Using with AI (Claude, Cursor, Copilot)

When starting a chat with AI:

1. Paste the contents of `project.arch`
2. Or attach `.arch/CODEBASE.md`

The AI will instantly understand:

- Your tech stack
- Your layer structure
- What can import what
- Your data flows
- Your conventions

No need to explain your codebase!

---

## Troubleshooting

### "No project.arch found"

- Make sure `project.arch` exists at your project root
- Run commands from the project root directory

### "Failed to parse project.arch"

- Check syntax errors (missing quotes, braces, etc.)
- Look at the line number in the error message
- Compare with example in `docs/arch/project.arch`

### "Missing directive" errors

- Add `'use server'` or `'use client'` at the top of files
- Or remove the `require directive` from that layer in `project.arch`

### Import boundary violations

- Either: fix the import (use the correct layer)
- Or: adjust `can import` in `project.arch` to allow it

---

## Integration with CI/CD

### GitHub Actions

```yaml
name: Architecture Check
on: [push, pull_request]

jobs:
  arch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm run arch:check
```

### Vercel

Add to `vercel.json`:

```json
{
  "buildCommand": "npm run arch:check && npm run build"
}
```

Or in `package.json`:

```json
{
  "scripts": {
    "build": "npm run arch:check && next build"
  }
}
```

---

## FAQ

**Q: Does arch require any npm packages?**

No. Zero dependencies. Pure Node.js built-ins.

**Q: Will arch slow down my build?**

Minimal impact. Checking happens once before build, typically <1 second for most codebases.

**Q: Can I disable arch for specific files?**

Not directly, but you can adjust your layer rules or use `except in` for rules.

**Q: Can I use arch with JavaScript instead of TypeScript?**

Yes. It checks `.js` files too. Just set `language javascript` in your arch block.

**Q: What if I want to break a rule temporarily?**

Change `severity error` to `severity warning` in the rule. Warnings don't block builds.

**Q: Can I have nested layers?**

Yes. Just use paths like `src/components/app` and `src/components/ui` as separate layers.

---

## Learn More

- Full specification: `docs/arch/arch.md`
- Complete example: `docs/arch/project.arch`
- CLI source: `arch-cli/arch.js`
- VS Code extension: `arch-cli/arch-vscode/`

---

## License

MIT

---

**Questions?** Check the README in `docs/arch/` or open an issue.
