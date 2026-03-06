#!/usr/bin/env node
// arc — architecture compiler CLI
// Usage: arc check | arc map | arc print | arc help

'use strict'

const fs     = require('fs')
const path   = require('path')
const { tokenize } = require('./lexer')
const { Parser }   = require('./parser')
const { Checker }  = require('./checker')
const { Mapper }   = require('./mapper')
const { ContextGenerator } = require('./context-generator')
const { scaffold } = require('./scaffold')
const { generateArc } = require('./generator')

// ── ANSI (zero deps) ──────────────────────────────────────────
const c = {
  red:    s => `\x1b[31m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  blue:   s => `\x1b[34m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
}

// ── Find architecture file (.arc or project.arc) ─────────────
function findArcFile(cwd) {
  const arcPath = path.join(cwd, '.arc')
  const legacyPath = path.join(cwd, 'project.arc')
  
  if (fs.existsSync(arcPath)) return arcPath
  if (fs.existsSync(legacyPath)) return legacyPath
  return null
}

// ── Load & parse architecture file ────────────────────────────
function loadArc(cwd) {
  const arcPath = findArcFile(cwd)
  
  if (!arcPath) {
    console.error(c.red(`\n✗  No .arc or project.arc found in ${cwd}\n`))
    console.error(c.dim('   Generate one: arc generate\n'))
    console.error(c.dim('   Or create manually. Run arc help for syntax.\n'))
    process.exit(1)
  }
  
  try {
    const source = fs.readFileSync(arcPath, 'utf8')
    const tokens = tokenize(source)
    return new Parser(tokens).parse()
  } catch (err) {
    const filename = path.basename(arcPath)
    console.error(c.red(`\n✗  Failed to parse ${filename}:\n`))
    console.error(c.yellow(`   ${err.message}\n`))
    process.exit(1)
  }
}

// ── arc generate ──────────────────────────────────────────
function cmdGenerate(cwd) {
  console.log(c.bold(c.blue('\n◆ arc generate\n')))
  
  try {
    const result = generateArc(cwd)
    console.log(c.green(`  ✓  Generated architecture files:\n`))
    result.files.forEach((file, i) => {
      console.log(c.green(`     • ${file}`))
      console.log(c.dim(`       ${result.paths[i]}\n`))
    })
    console.log(c.dim('  Review and customize the files, then run: arc check\n'))
    process.exit(0)
  } catch (err) {
    console.error(c.red(`\n✗  Failed to generate architecture:\n`))
    console.error(c.yellow(`   ${err.message}\n`))
    process.exit(1)
  }
}

// ── arc check ───────────────────────────────────────────────
function cmdCheck(cwd) {
  console.log(c.bold(c.blue('\n◆ arc check\n')))
  const ast = loadArc(cwd)
  const arcFile = path.basename(findArcFile(cwd))
  console.log(c.dim(`  Parsed ${arcFile} — ${ast.layers.length} layers, ${ast.rules.length} rules\n`))

  const violations = new Checker(ast, cwd).run()
  const errors     = violations.filter(v => v.severity === 'error')
  const warnings   = violations.filter(v => v.severity === 'warning')

  if (warnings.length > 0) {
    console.log(c.yellow(`  ⚠  ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:\n`))
    for (const v of warnings) {
      const loc = v.line ? `:${v.line}` : ''
      console.log(c.yellow(`  ${v.file}${loc}`))
      console.log(c.dim(`  └─ [${v.rule}] ${v.message}\n`))
    }
  }

  if (errors.length > 0) {
    console.log(c.red(`  ✗  ${errors.length} error${errors.length > 1 ? 's' : ''}:\n`))
    for (const v of errors) {
      const loc = v.line ? `:${v.line}` : ''
      console.log(c.red(`  ${v.file}${loc}`))
      console.log(c.dim(`  └─ [${v.rule}] ${v.message}\n`))
    }
    console.log(c.red(`  Architecture check failed.\n`))
    process.exit(1)
  }

  console.log(c.green(`  ✓  Architecture is clean. No violations found.\n`))
  process.exit(0)
}

// ── arc map ─────────────────────────────────────────────────
function cmdMap(cwd) {
  console.log(c.bold(c.blue('\n◆ arc map\n')))
  const ast = loadArc(cwd)
  new Mapper(ast, cwd).write()
  console.log(c.green(`  ✓  Generated .arc-output/CODEBASE.md\n`))
  console.log(c.dim(`  Tip: paste .arc into Claude or Cursor for instant full context.\n`))
  process.exit(0)
}

// ── arc context ─────────────────────────────────────────────
function cmdContext(cwd) {
  console.log(c.bold(c.blue('\n◆ arc context\n')))
  const ast = loadArc(cwd)
  const generator = new ContextGenerator(ast, cwd)
  const result = generator.write()
  const kb = (result.sizeBytes / 1024).toFixed(1)

  console.log(c.green(`  ✓  Generated ${result.outputFile}\n`))
  console.log(c.dim(`  Size: ${kb}kb — fits in any LLM context window.\n`))
  console.log(c.dim('  Upload this file to your LLM before any coding session.\n'))
  process.exit(0)
}

// ── arc print ───────────────────────────────────────────────
function cmdPrint(cwd) {
  console.log(c.bold(c.blue('\n◆ arc print\n')))
  const { project, layers, rules, flows, conventions, features } = loadArc(cwd)

  if (project) {
    console.log(c.bold(`  ${project.id ?? project.name} v${project.version}`))
    if (project.id && project.name && project.id !== project.name) {
      console.log(c.dim(`  Architecture: ${project.name}`))
    }
    console.log(c.dim(`  ${project.stack.join(' + ')} · ${project.language}\n`))
  }

  console.log(c.bold(`  Layers (${layers.length})`))
  for (const l of layers) {
    const imp = l.canImport.length ? l.canImport.join(', ') : 'none'
    console.log(`  ${c.cyan(l.name.padEnd(16))} ${c.dim(l.path)}`)
    console.log(`  ${''.padEnd(16)} imports: ${imp}${l.directive ? `  |  requires: "${l.directive}"` : ''}${l.readonly ? '  |  readonly' : ''}`)
  }

  if (rules.length) {
    console.log(c.bold(`\n  Rules (${rules.length})`))
    for (const r of rules) {
      const sev = r.severity === 'error' ? c.red('error  ') : c.yellow('warning')
      console.log(`  ${sev}  ${c.dim(r.id)}`)
      console.log(`  ${''.padEnd(9)}  ${r.description}`)
    }
  }

  if (flows.length) {
    console.log(c.bold(`\n  Flows (${flows.length})`))
    for (const f of flows) {
      console.log(`  ${c.cyan(f.name.padEnd(20))}  ${c.dim(f.description)}`)
    }
  }

  if (conventions.length) {
    console.log(c.bold(`\n  Conventions (${conventions.length})`))
    for (const cv of conventions) {
      console.log(`  ${c.cyan(cv.name.padEnd(20))}  ${c.dim(cv.pattern)}`)
    }
  }

  if (features.length) {
    console.log(c.bold(`\n  Features (${features.length})`))
    for (const f of features) {
      console.log(`  ${c.cyan(f.name.padEnd(20))}  ${c.dim(f.status)}`)
    }
  }

  console.log('')
  process.exit(0)
}

// ── arc scaffold ────────────────────────────────────────────
function cmdScaffold(cwd) {
  const type = process.argv[3]
  const name = process.argv[4]
  
  if (!type || !name) {
    console.error(c.red('\n✗  Usage: arc scaffold <type> <name>\n'))
    console.error(c.dim('   Types: action, hook, component\n'))
    process.exit(1)
  }

  const ast = loadArc(cwd)
  scaffold(ast, cwd, type, name)
  process.exit(0)
}

// ── arc help ────────────────────────────────────────────────
function cmdHelp() {
  console.log(`
${c.bold('arc')} — architecture compiler for your codebase

${c.bold('Commands:')}
  ${c.cyan('arc generate')}           Generate .arc from package.json (${c.dim('start here')})
  ${c.cyan('arc check')}              Validate codebase against .arc rules
  ${c.cyan('arc map')}                Generate ${c.dim('.arc-output/CODEBASE.md')}
  ${c.cyan('arc context')}            Generate ${c.dim('.arc-output/LLM_CONTEXT.md')} for AI upload
  ${c.cyan('arc print')}              Pretty-print parsed .arc file
  ${c.cyan('arc scaffold <type> <name>')}   Create a new file (action, hook, component)
  ${c.cyan('arc help')}               Show this help

${c.bold('Quick Start:')}
  1. ${c.cyan('arc generate')}         Generate .arc from package.json
  2. ${c.cyan('arc check')}            Validate your codebase
  3. ${c.cyan('arc map')}              Generate documentation map
  4. ${c.cyan('arc context')}          Generate AI context file

${c.bold('What is .arc?')}
  The ${c.dim('.arc')} file defines your codebase architecture:
  ${c.dim('arc')}        project name, stack, version
  ${c.dim('layer')}       paths, what each layer can import
  ${c.dim('rule')}        forbidden imports/patterns + severity
  ${c.dim('flow')}        data flows through your app
  ${c.dim('convention')}  file naming patterns
  ${c.dim('context')}     AI-readable summary of the project

${c.bold('Setup in package.json:')}
  ${c.dim('"build": "arc check && next build"')}

  Now your build fails on architecture violations,
  exactly like TypeScript fails on type errors.

${c.bold('Paste .arc into Claude or Cursor')} for instant
full codebase understanding — no explanation needed.
`)
  process.exit(0)
}

// ── Entry ─────────────────────────────────────────────────────
const cwd = process.cwd()
const cmd = process.argv[2] ?? 'help'

switch (cmd) {
  case 'generate': cmdGenerate(cwd); break
  case 'check':    cmdCheck(cwd);    break
  case 'map':      cmdMap(cwd);      break
  case 'context':  cmdContext(cwd);  break
  case 'print':    cmdPrint(cwd);    break
  case 'scaffold': cmdScaffold(cwd); break
  default:         cmdHelp();        break
}
