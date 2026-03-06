#!/usr/bin/env node
// arch — architecture compiler CLI
// Usage: arch check | arch map | arch print | arch help

'use strict'

const fs     = require('fs')
const path   = require('path')
const { tokenize } = require('./lexer')
const { Parser }   = require('./parser')
const { Checker }  = require('./checker')
const { Mapper }   = require('./mapper')
const { scaffold } = require('./scaffold')
const { generateArch } = require('./generator')

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

// ── Find architecture file (.arc or project.arch) ─────────────
function findArchFile(cwd) {
  const arcPath = path.join(cwd, '.arc')
  const legacyPath = path.join(cwd, 'project.arch')
  
  if (fs.existsSync(arcPath)) return arcPath
  if (fs.existsSync(legacyPath)) return legacyPath
  return null
}

// ── Load & parse architecture file ────────────────────────────
function loadArch(cwd) {
  const archPath = findArchFile(cwd)
  
  if (!archPath) {
    console.error(c.red(`\n✗  No .arc or project.arch found in ${cwd}\n`))
    console.error(c.dim('   Generate one: arch generate\n'))
    console.error(c.dim('   Or create manually. Run arch help for syntax.\n'))
    process.exit(1)
  }
  
  try {
    const source = fs.readFileSync(archPath, 'utf8')
    const tokens = tokenize(source)
    return new Parser(tokens).parse()
  } catch (err) {
    const filename = path.basename(archPath)
    console.error(c.red(`\n✗  Failed to parse ${filename}:\n`))
    console.error(c.yellow(`   ${err.message}\n`))
    process.exit(1)
  }
}

// ── arch generate ──────────────────────────────────────────
function cmdGenerate(cwd) {
  console.log(c.bold(c.blue('\n◆ arch generate\n')))
  
  try {
    const result = generateArch(cwd)
    console.log(c.green(`  ✓  Generated architecture files:\n`))
    result.files.forEach((file, i) => {
      console.log(c.green(`     • ${file}`))
      console.log(c.dim(`       ${result.paths[i]}\n`))
    })
    console.log(c.dim('  Review and customize the files, then run: arch check\n'))
    process.exit(0)
  } catch (err) {
    console.error(c.red(`\n✗  Failed to generate architecture:\n`))
    console.error(c.yellow(`   ${err.message}\n`))
    process.exit(1)
  }
}

// ── arch check ───────────────────────────────────────────────
function cmdCheck(cwd) {
  console.log(c.bold(c.blue('\n◆ arch check\n')))
  const ast = loadArch(cwd)
  const archFile = path.basename(findArchFile(cwd))
  console.log(c.dim(`  Parsed ${archFile} — ${ast.layers.length} layers, ${ast.rules.length} rules\n`))

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

// ── arch map ─────────────────────────────────────────────────
function cmdMap(cwd) {
  console.log(c.bold(c.blue('\n◆ arch map\n')))
  const ast = loadArch(cwd)
  new Mapper(ast, cwd).write()
  console.log(c.green(`  ✓  Generated .arch/CODEBASE.md\n`))
  console.log(c.dim(`  Tip: paste project.arch into Claude or Cursor for instant full context.\n`))
  process.exit(0)
}

// ── arch print ───────────────────────────────────────────────
function cmdPrint(cwd) {
  console.log(c.bold(c.blue('\n◆ arch print\n')))
  const { project, layers, rules, flows, conventions } = loadArch(cwd)

  if (project) {
    console.log(c.bold(`  ${project.name} v${project.version}`))
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

  console.log('')
  process.exit(0)
}

// ── arch scaffold ────────────────────────────────────────────
function cmdScaffold(cwd) {
  const type = process.argv[3]
  const name = process.argv[4]
  
  if (!type || !name) {
    console.error(c.red('\n✗  Usage: arch scaffold <type> <name>\n'))
    console.error(c.dim('   Types: action, hook, component\n'))
    process.exit(1)
  }

  const ast = loadArch(cwd)
  scaffold(ast, cwd, type, name)
  process.exit(0)
}

// ── arch help ────────────────────────────────────────────────
function cmdHelp() {
  console.log(`
${c.bold('arch')} — architecture compiler for your codebase

${c.bold('Commands:')}
  ${c.cyan('arch generate')}           Generate .arc from package.json (${c.dim('start here')})
  ${c.cyan('arch check')}              Validate codebase against .arc rules
  ${c.cyan('arch map')}                Generate ${c.dim('.arch/CODEBASE.md')}
  ${c.cyan('arch print')}              Pretty-print parsed .arc file
  ${c.cyan('arch scaffold <type> <name>')}   Create a new file (action, hook, component)
  ${c.cyan('arch help')}               Show this help

${c.bold('Quick Start:')}
  1. ${c.cyan('arch generate')}         Generate .arc from package.json
  2. ${c.cyan('arch check')}            Validate your codebase
  3. ${c.cyan('arch map')}              Generate documentation

${c.bold('What is .arc?')}
  The ${c.dim('.arc')} file defines your codebase architecture:
  ${c.dim('arch')}        project name, stack, version
  ${c.dim('layer')}       paths, what each layer can import
  ${c.dim('rule')}        forbidden imports/patterns + severity
  ${c.dim('flow')}        data flows through your app
  ${c.dim('convention')}  file naming patterns
  ${c.dim('context')}     AI-readable summary of the project

${c.bold('Setup in package.json:')}
  ${c.dim('"build": "arch check && next build"')}

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
  case 'print':    cmdPrint(cwd);    break
  case 'scaffold': cmdScaffold(cwd); break
  default:         cmdHelp();        break
}
