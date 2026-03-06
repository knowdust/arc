# I want to create this arch.config.ts as arch.arch my own like for codebase architecture in one file

Q: What syntax feel do you want for .arch?
A: Custom DSL (totally new, expressive)

Q: What should the .arch file be able to do? (Select all that apply)
A: Declare layers + import rules, Document data flows, Define naming conventions, Embed AI context/summary, and enforce the arhcitecture and rules

Q: How should it integrate with your toolchain? (Select all that apply)
A: CLI: arch check / arch map

Perfect. Let's build this properly.Now let me design the DSL syntax and build the full implementation.Now let's build and test it:No network — let me compile without npm using Node's built-in types bundled locally:Good — Node 22. I'll write the CLI as pure JS (no build step needed), keeping all the same logic:Now let's test the full thing end-to-end:Compiler is working perfectly. Now test `arch print` and `arch map`:Everything works. Now package it all up cleanly:Here's what you just got — a real working compiler, zero dependencies, pure Node.js.

## What was built

**7 files, 4 compiler stages** — exactly like a real language compiler:

- `lexer.js` — reads `.arch` source character by character, emits tokens
- `parser.js` — consumes tokens, builds an AST (Abstract Syntax Tree)
- `checker.js` — walks your real codebase files and enforces the AST rules
- `mapper.js` — reads the AST and generates `.arch/CODEBASE.md`
- `arch.js` — the CLI that ties it all together
- `project.arch` — your DSL file, the single source of truth

## How to install in your Next.js app

```bash
# Copy the arch-cli folder into your project root
# Then add to package.json:
"scripts": {
  "arch:check": "node arch-cli/arch.js check",
  "arch:map":   "node arch-cli/arch.js map",
  "arch:print": "node arch-cli/arch.js print",
  "prebuild":   "node arch-cli/arch.js check"
}
```

Then edit `project.arch` to match your exact paths, and `npm run build` will fail on architecture violations — exactly like `tsc` fails on type errors.
