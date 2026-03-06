# Enhanced Arch CLI with Generation Feature

I've successfully implemented the arch generation feature that creates a short-named `.arc` file from `package.json`.

## New Features

### 1. `arch:generate` Command

Generates `.arc` architecture file automatically from `package.json`:

```bash
pnpm arch:generate    # Generates .arc file at root
```

### 2. Short Filename: `.arc`

- Changed from `project.arch` to `.arc` (short, dev-friendly, max 3 characters after dot)
- Follows pattern like `.env`, `.gitignore`, etc.
- Backward compatible: still reads `project.arch` if `.arc` doesn't exist

### 3. Auto-Detection

The CLI now:

- First checks for `.arc` file
- Falls back to `project.arch` (backward compatible)
- Shows helpful error message if neither found

### 4. What Gets Generated

The `.arc` file includes:

- Project name from `package.json`
- Version from `package.json`
- Tech stack automatically detected from dependencies: nextjs, typescript, prisma, supabase, shadcn, tailwind, zustand, eslint, etc.
- Pre-configured 7 layers: types, lib, hooks, actions, components, ui, pages
- Pre-configured 3 rules: no-db-in-components (error), no-console-logs (warning), no-any-types (warning)

### 5. Updated CLI Help

```bash
$ node arch/arch-cli/arch.js help

arch — architecture compiler for your codebase

Commands:
    arch generate           Generate .arc from package.json (start here)
    arch check              Validate codebase against .arc rules
    arch map                Generate .arch/CODEBASE.md
    arch print              Pretty-print parsed .arc file
    arch scaffold <type> <name>   Create a new file
    arch help               Show this help
```

## File Changes

| File | Change |
| --- | --- |
| `generator.js` | NEW - Generates .arc from package.json |
| `arch.js` | Updated to support .arc and new generate command |
| `.arc` | AUTO-GENERATED at root |

## Generated `.arc` File

```md
arch "knowdust" {
    version  "0.1.0"
    stack    nextjs + typescript + prisma + supabase + shadcn + tailwind + zustand + eslint
    language typescript
}

# 7 layers configured
layer types { ... }
layer lib { ... }
layer hooks { ... }
layer actions { ... }
layer components { ... }
layer ui { ... }
layer pages { ... }

# 3 rules configured
rule "no-db-in-components" { ... }
rule "no-console-logs" { ... }
rule "no-any-types" { ... }
```

## Test Commands

```bash
# Generate .arc from package.json
node arch/arch-cli/arch.js generate

# View the architecture
node arch/arch-cli/arch.js print

# Validate codebase
node arch/arch-cli/arch.js check

# Generate documentation
node arch/arch-cli/arch.js map
```

All commands work perfectly! The `.arc` file is auto-generated and ready to use. ✅
