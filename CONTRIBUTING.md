# Contributing to arc

Thank you for considering a contribution. Arc is early and every contribution matters a lot right now.

This document covers everything you need: what to work on, how to set up your environment, how to submit changes, and what the bar is for merging.

---

## Table of Contents

1. [What we need most right now](#1-what-we-need-most-right-now)
2. [How the codebase works](#2-how-the-codebase-works)
3. [Setting up locally](#3-setting-up-locally)
4. [Types of contributions](#4-types-of-contributions)
5. [Adding a new template](#5-adding-a-new-template)
6. [Adding a new DSL feature](#6-adding-a-new-dsl-feature)
7. [Fixing a bug](#7-fixing-a-bug)
8. [Submitting a pull request](#8-submitting-a-pull-request)
9. [Code style](#9-code-style)
10. [Design principles](#10-design-principles)

---

## 1. What we need most right now

In rough priority order:

**High value — grab these:**

- `project.arc` templates for stacks not covered yet (SvelteKit, Remix, NestJS, Astro, tRPC, Drizzle, Hono, Fastify)
- Bug reports with minimal reproductions (open an issue, no PR needed)
- Edge cases in the parser (malformed `.arc` files that crash instead of giving a helpful error)
- Test files — we have almost none right now

**Medium value:**

- VS Code extension improvements (hover docs, autocomplete for layer names in `can import []`)
- New `enforce` flags (e.g. `no-default-exports`, `no-barrel-files`)
- New rule types beyond `forbid import`, `forbid pattern`, `forbid package`

**Lower priority right now:**

- Performance optimization (the checker is fast enough for most codebases)
- A config file for the CLI itself (not needed yet)
- A web UI (out of scope for now)

If you're unsure whether something is wanted, **open an issue first** and describe what you want to add. This saves you time if the direction doesn't fit.

---

## 2. How the codebase works

Arc is a compiler. Understanding the pipeline makes contributing much easier.

```text
project.arc (raw text)
      │
      ▼
lexer.js          source string → Token[]
      │            Each token has: type, value, line, col
      ▼
parser.js         Token[] → ArchAST
      │            Recursive descent. One method per block type.
      ▼
checker.js        ArchAST + cwd → Violation[]
      │            7 passes. Each pass is a separate method.
      ├── Pass 1: Import boundaries
      ├── Pass 2: Required directives
      ├── Pass 3: Filename conventions
      ├── Pass 4: Custom rules (forbid import/pattern/package)
      ├── Pass 5: Export shape enforcement
      ├── Pass 6: Circular imports (uses graph.js)
      └── Pass 7: Dead exports
      │
      ├── mapper.js          → .arc/CODEBASE.md
      ├── context-generator.js → .arc/LLM_CONTEXT.md
      └── scaffold.js        → new files from templates
```

**Key files:**

| File | What it does |
| --- | --- |
| `arc.js` | CLI entry. Parses argv, calls commands. |
| `lexer.js` | Character-by-character tokenizer. No regex on full source. |
| `parser.js` | Recursive descent parser. Builds AST. |
| `checker.js` | All 7 enforcement passes. Each pass is a method. |
| `graph.js` | Builds import graph. Detects cycles with DFS. |
| `mapper.js` | Generates CODEBASE.md from AST + real file tree. |
| `context-generator.js` | Generates LLM_CONTEXT.md from AST. |
| `scaffold.js` | Creates files from templates. |
| `templates.js` | Built-in `project.arc` presets as strings. |

**The AST shape** is the contract between the parser and everything else.
If you add a new DSL feature, you change the AST, the parser, and whatever consumes that AST node.

---

## 3. Setting up locally

Arc has zero npm dependencies for the CLI. You need Node ≥ 18 and nothing else.

```bash
# Clone
git clone https://github.com/your-username/arc
cd arc

# Verify it works
node arc-cli/arc.js help

# Run against any project that has a project.arc
cd /path/to/your-project
node /path/to/arc/arc-cli/arc.js check
```

**For the VS Code extension:**

```bash
cd arc-vscode
npm install          # installs vsce for packaging
npx vsce package     # builds arc-language-x.x.x.vsix
code --install-extension arc-language-*.vsix
```

**There is no build step for the CLI.** It's plain JavaScript. Edit and run immediately.

---

## 4. Types of contributions

### New template

The most immediately useful contribution. See [section 5](#5-adding-a-new-template).

### New DSL feature

Requires changes to lexer, parser, at least one checker pass or generator, and docs.
**Open an issue first** to discuss syntax before implementing.
See [section 6](#6-adding-a-new-dsl-feature).

### Bug fix

Find it, reproduce it minimally, fix it, add a test case (even just a `.arc` file that previously crashed/gave wrong output). See [section 7](#7-fixing-a-bug).

### Documentation

Fix mistakes, add examples, improve explanations. No issue needed. Just PR.

### VS Code extension

The grammar file is `arc-vscode/syntaxes/arc.tmLanguage.json`.
TextMate grammars are finicky. Test every change by opening `project.arc` in VS Code with the extension loaded.

---

## 5. Adding a new template

This is the highest-value contribution and the easiest to get merged.

### What makes a good template

- Covers a real, common project type not already in `templates.js`
- Has at least 4 meaningful layers (not just "src" and "tests")
- Has at least 3 rules that prevent real mistakes for that stack
- Has a `context {}` block with a useful summary
- Has at least 2 conventions
- Has been tested — the template parses correctly via `arc init <name>`

### How to add one

**1. Add the template string to `templates.js`:**

```javascript
// templates.js
module.exports = {
  'vanilla':      '...',
  'react-spa':    '...',
  'nextjs':       '...',
  'express-api':  '...',
  'cli':          '...',
  'extension':    '...',
  'your-template': `
arc "your-stack-app" {
  version  "1.0.0"
  stack    your + stack + here
  language typescript
}

layer types {
  ...
}

# etc.
  `,
}
```

**2. Add it to the `arc init` help output in `arc.js`:**

```javascript
// In cmdInit(), the template list:
console.log(`  your-template   Your Stack description`)
```

**3. Test it:**

```bash
# In a temp directory:
node /path/to/arc/arc-cli/arc.js init your-template
# Verify project.arc was created
node /path/to/arc/arc-cli/arc.js print
# Should show all layers and rules cleanly
```

**4. Add a line to the README templates table.**

**5. PR title format:** `feat(templates): add SvelteKit template`

### Stacks we most want templates for

- SvelteKit
- Remix
- NestJS
- Astro (content site)
- Astro (app with islands)
- tRPC + Next.js
- Hono (edge API)
- Fastify
- Electron
- React Native / Expo
- Tauri

---

## 6. Adding a new DSL feature

New DSL features require changes across multiple files. Follow this checklist exactly.

### Before you start — open an issue

Describe:

- What problem it solves
- The proposed syntax (a `.arc` example)
- What AST node it adds or modifies
- Which checker pass it affects

Wait for a response before implementing. Syntax decisions are hard to reverse.

### Implementation checklist

**Step 1 — Lexer (`lexer.js`)**

Add any new keywords to the `KEYWORDS` set:

```javascript
const KEYWORDS = new Set([
  // existing keywords...
  'your-new-keyword',
])
```

**Step 2 — Parser (`parser.js`)**

Add the new field/block to the AST default:

```javascript
// In parse(), initialize the new field:
const ast = {
  // existing fields...
  newThing: [],        // or null if single
}
```

Add parsing logic. If it's a new field inside an existing block, add a case in the relevant `parse*` method. If it's a new top-level block, add a case in the top-level dispatch and a new `parseNewThing()` method.

**Step 3 — Checker (`checker.js`)** (if enforced)

If the new feature adds enforcement, add a new pass method:

```javascript
checkNewThing() {
  // only runs if the relevant AST data is present
  if (!this.ast.newThing || this.ast.newThing.length === 0) return

  // walk files, check, push to this.violations
}
```

Call it in `run()`:

```javascript
run() {
  this.violations = []
  this.checkImportBoundaries()
  this.checkDirectives()
  this.checkFilenames()
  this.checkRules()
  this.checkExportShapes()
  this.checkCircularImports()
  this.checkDeadExports()
  this.checkNewThing()      // ← add here
  return this.violations
}
```

**Step 4 — Mapper and/or ContextGenerator** (if it should appear in output)

Add the new section to `mapper.js` and/or `context-generator.js`.

**Step 5 — VS Code grammar** (`arc-vscode/syntaxes/arc.tmLanguage.json`)

Add the new keyword to the appropriate capture group.

**Step 6 — Documentation** (README.md)

Update README.md DSL reference table.

**Step 7 — Backward compatibility** (always)

Verify: if someone has an old `project.arc` without the new keyword, does it still parse cleanly?
The parser's unknown-keyword-skip logic handles this automatically **only if** you don't add required fields.
New features must always be optional.

### Backward compatibility rule — non-negotiable

> Any `project.arc` file that parsed correctly in a previous version must parse correctly in the new version.

This means:

- New keywords inside blocks: always optional
- New top-level blocks: always optional
- Removing a keyword: never — deprecate only

---

## 7. Fixing a bug

**1. Open an issue** describing:

- The `.arc` file content (or minimal reproduction)
- The command you ran
- What you expected
- What actually happened (output or error)

**2. Confirm the bug** by reproducing it locally.

**3. Write a minimal `.arc` file** that triggers the bug. Save it in `test-fixtures/` with a descriptive name.

**4. Fix the bug.**

**5. Verify your fix** using the minimal reproduction.

**6. Submit PR** with the test fixture included.

### Common bug areas

**Parser:** Unexpected token errors on valid syntax. Usually a missing `eatIf()` or wrong `expect()` call.

**Checker Pass 1 (import boundaries):** False positives on valid imports. Usually a path resolution issue with `@/` prefix or Windows path separators.

**Checker Pass 6 (circular imports):** Missing cycles or false cycle reports. Check the graph traversal in `graph.js`.

**Checker Pass 7 (dead exports):** False positives on re-exports or Next.js special exports (`GET`, `POST`, `metadata`). These should be excluded.

---

## 8. Submitting a pull request

### Before submitting

- [ ] `node arc-cli/arc.js help` runs without errors
- [ ] `node arc-cli/arc.js print` works on the example `project.arc` in the repo
- [ ] `node arc-cli/arc.js check` correctly catches known violations on test fixtures
- [ ] If you changed the VS Code extension: syntax highlighting works on `project.arc`
- [ ] If you added a template: `arc init <your-template>` creates a valid file
- [ ] README is updated if you added/changed user-facing features
- [ ] No new npm dependencies added to the CLI

### PR title format

```text
feat(templates): add SvelteKit template
feat(dsl): add require-test-file layer constraint
fix(checker): false positive on barrel index.ts exports
fix(parser): crash on empty string list []
docs: improve getting started section
chore: add test fixtures for import boundary checks
```

### PR description

Include:

- What problem this solves
- What you changed
- How to test it (command to run, expected output)
- Any backward compatibility notes

### Review process

All PRs get reviewed. For small fixes and templates, turnaround is usually quick.
For DSL changes, expect discussion on syntax before merge — these decisions compound.

---

## 9. Code style

Arc's CLI is plain JavaScript with no build step, no TypeScript compilation, no bundler.

**Rules:**

- `'use strict'` at top of every file
- `const` for everything that doesn't change, `let` for everything that does, never `var`
- `module.exports = { ... }` at the bottom of every module
- No semicolons at end of lines (the codebase is consistent without them)
- Single quotes for strings
- 2-space indentation
- Arrow functions for callbacks: `files.forEach(file => { ... })`
- Named functions at the top level: `function tokenize(source) { ... }`
- Comments above non-obvious blocks using `// ── Section name ───` style

**No linter config yet** — just follow the existing style. Consistency matters more than perfection.

**Error messages** always include:

- The rule ID in square brackets: `[import-boundary]`
- The file path (relative, forward-slash normalized)
- The line number if known
- A human-readable explanation
- The specific violation (the import path, the forbidden pattern, etc.)

---

## 10. Design principles

These are the decisions made that contributions must respect.

**Zero dependencies.**
The CLI runs with only Node built-ins. This is not negotiable. It means arc works anywhere Node ≥ 18 runs, with no install step, no lockfile conflicts, no supply chain surface. If a feature seems to need a dependency, think harder — it usually doesn't.

**The `.arc` file is the product.**
The CLI is just a reader of the `.arc` file. The `.arc` file is what people write, maintain, version control, and share. Every decision about the CLI should serve the `.arc` file, not the other way around.

**Errors are precise, not helpful.**
"Helpful" error messages try to guess what you meant. Arc error messages tell you exactly what rule was violated, on which line, in which file, and what the violation was. The arc.check output must be pasteable directly into an LLM and be immediately actionable.

**Backward compatibility is sacred.**
A `.arc` file written for arc v1.0 must parse in arc v2.0. Unknown keywords are silently skipped. New fields are always optional. This is what lets people upgrade without breaking their setup.

**arc is a declarative compiler, not a prescriptive framework.**
Arc enforces what *you* declare — it doesn't have opinions about what your architecture should be. Someone building a vanilla JS app and someone building a NestJS monolith both use arc to enforce their own rules. Arc never tells you what your layers should be.

**The LLM context is a first-class output.**
`arc context` generating `LLM_CONTEXT.md` is not a secondary feature — it's why the `features {}` block exists and why the `context {}` block has an `summary` field. Every feature added to arc should consider: "how does this appear in LLM_CONTEXT.md?"

---

## Questions?

Open an issue tagged `question`. There are no dumb questions about early-stage tools.

If you're not sure whether an idea fits, describe it in an issue before building it.
That's the fastest path to getting something merged.
