# GitHub Copilot v8 Arc DSL Update

I'll update the Arc DSL grammar and generator so stack is parsed as an array syntax and add support for a name field in the arc { ... } project block, then verify with arc generate and arc print.

I found the relevant parser and generator pieces. Next I'm patching the DSL to accept stack["..."] (array style) and add name: "..." in the arc block, while keeping backward compatibility with the old stack format.

Core grammar changes are in place. I'll do one more pass to align output exactly to your requested name: "..." format and then run arc generate + arc print to confirm end-to-end behavior.

## Implementation Complete

Implemented. .arc generation now uses the format you requested:

- stack is generated as an array
- project block supports name: "..." inside arc "..." { ... }

### What Changed

Updated parser to support:

- name: "Feature Based Architecture" in project block
- stack ["nextjs", "typescript", ...] (array syntax)
- Backward compatibility for old stack a + b + c format

Updated generator to output:

- name: "Feature Based Architecture"
- stack ["nextjs", ...]

Updated printer to show both:

- project id (arc "knowdust")
- architecture name (name: ...)

Updated .arc syntax highlighting keywords to include name.

### Verified

- node arc.js generate works
- node arc.js print parses and prints correctly
- Generated .arc now starts like expected format

### Files Updated

- parser.js
- lexer.js
- generator.js
- arc.js
- arc.tmLanguage.json
- Regenerated root file: .arc

### Next Steps

If you want, I can also enforce that stack must always be array syntax (remove old + parsing entirely).
