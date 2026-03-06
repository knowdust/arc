// mapper.js — generates .arch/CODEBASE.md

const fs   = require('fs')
const path = require('path')

class Mapper {
  constructor(ast, cwd) {
    this.ast = ast
    this.cwd = cwd
  }

  walkTree(dir, indent = '') {
    const absDir = path.join(this.cwd, dir)
    if (!fs.existsSync(absDir)) return `${indent}(not found)\n`
    let out = ''
    const entries = fs.readdirSync(absDir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.next')
    for (const entry of entries) {
      if (entry.isDirectory()) {
        out += `${indent}📁 ${entry.name}/\n`
        out += this.walkTree(path.join(dir, entry.name), indent + '  ')
      } else {
        out += `${indent}📄 ${entry.name}\n`
      }
    }
    return out
  }

  countFiles(dir) {
    const absDir = path.join(this.cwd, dir)
    if (!fs.existsSync(absDir)) return 0
    let count = 0
    const entries = fs.readdirSync(absDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) count += this.countFiles(path.join(dir, entry.name))
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) count++
    }
    return count
  }

  generate() {
    const { project, layers, rules, flows, conventions, context } = this.ast
    const now = new Date().toISOString()

    let md = `# CODEBASE MAP
> Auto-generated from \`project.arch\` on ${now}
> Run \`arch map\` to regenerate. Do not edit manually.

---

`
    if (project) {
      md += `## Project: ${project.name}
- **Version**: ${project.version}
- **Stack**: ${project.stack.join(' + ')}
- **Language**: ${project.language}

---

`
    }

    if (context) {
      md += `## Summary
${context.summary}

### Critical Files
${context.criticalFiles.map(f => `- \`${f}\``).join('\n')}

### Do Not Touch
${context.doNotTouch.map(f => `- \`${f}\``).join('\n')}

---

`
    }

    md += `## Architecture Layers

| Layer | Path | Can Import From | Files |
|---|---|---|---|
${layers.map(l =>
  `| **${l.name}** | \`${l.path}\` | ${l.canImport.length ? l.canImport.join(', ') : '—'} | ${this.countFiles(l.path)} |`
).join('\n')}

### Descriptions
${layers.map(l =>
  `- **${l.name}**${l.readonly ? ' *(readonly)*' : ''}: ${l.description}${l.directive ? ` *(requires \`"${l.directive}"\`)*` : ''}`
).join('\n')}

---

`

    if (flows.length > 0) {
      md += `## Data Flows\n\n`
      for (const flow of flows) {
        md += `### ${flow.name}
${flow.description}

${flow.steps.length ? `**Steps**:\n${flow.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}`
        if (flow.touches.length) md += `\n**Files**: ${flow.touches.map(f => `\`${f}\``).join(', ')}`
        if (flow.tables.length)  md += `\n**Tables**: ${flow.tables.map(t => `\`${t}\``).join(', ')}`
        if (flow.fields.length)  md += `\n**Key fields**: ${flow.fields.map(f => `\`${f}\``).join(', ')}`
        md += '\n\n'
      }
      md += `---\n\n`
    }

    if (rules.length > 0) {
      md += `## Rules (${rules.length})

| ID | Severity | Description |
|---|---|---|
${rules.map(r =>
  `| \`${r.id}\` | ${r.severity === 'error' ? '🔴 error' : '🟡 warning'} | ${r.description} |`
).join('\n')}

---

`
    }

    if (conventions.length > 0) {
      md += `## Naming Conventions

| Name | Pattern |
|---|---|
${conventions.map(c => `| \`${c.name}\` | \`${c.pattern}\` |`).join('\n')}

---

`
    }

    md += `## File Tree

\`\`\`
src/
${this.walkTree('src', '  ')}\`\`\`
`

    return md
  }

  write() {
    const content = this.generate()
    const outDir = path.join(this.cwd, '.arch')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'CODEBASE.md'), content)
  }
}

module.exports = { Mapper }
