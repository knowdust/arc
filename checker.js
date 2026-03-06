// checker.js — enforces .arch rules against your actual codebase

const fs   = require('fs')
const path = require('path')

class Checker {
  constructor(ast, cwd) {
    this.ast  = ast
    this.cwd  = cwd
    this.violations = []
  }

  walkFiles(dir) {
    const absDir = path.join(this.cwd, dir)
    if (!fs.existsSync(absDir)) return []
    const results = []
    const entries = fs.readdirSync(absDir, { withFileTypes: true })
    for (const entry of entries) {
      const relPath = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...this.walkFiles(relPath))
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) results.push(relPath)
    }
    return results
  }

  readFile(relPath) {
    return fs.readFileSync(path.join(this.cwd, relPath), 'utf8')
  }

  // ── Check 1: import boundaries ──────────────────────────────

  checkImportBoundaries() {
    for (const layer of this.ast.layers) {
      if (layer.readonly) continue
      const files = this.walkFiles(layer.path)

      for (const file of files) {
        const lines = this.readFile(file).split('\n')

        lines.forEach((line, idx) => {
          const match = line.match(/from\s+['"](@\/[^'"]+)['"]/)
          if (!match) return
          const importPath   = match[1]
          const resolvedPath = importPath.replace('@/', 'src/')

          for (const other of this.ast.layers) {
            if (other.name === layer.name) continue
            if (!resolvedPath.startsWith(other.path)) continue

            if (!layer.canImport.includes(other.name)) {
              this.violations.push({
                severity: 'error',
                rule: 'import-boundary',
                file: file.replace(/\\/g, '/'),
                line: idx + 1,
                message: `[${layer.name}] cannot import from [${other.name}] → "${importPath}"`,
              })
            }
          }
        })
      }
    }
  }

  // ── Check 2: required directives ───────────────────────────

  checkDirectives() {
    for (const layer of this.ast.layers) {
      if (!layer.directive) continue
      const files = this.walkFiles(layer.path)

      for (const file of files) {
        const content = this.readFile(file)
        const has = content.includes(`"${layer.directive}"`) || content.includes(`'${layer.directive}'`)
        if (!has) {
          this.violations.push({
            severity: 'error',
            rule: 'missing-directive',
            file: file.replace(/\\/g, '/'),
            message: `Missing "${layer.directive}" — required in [${layer.name}] layer`,
          })
        }
      }
    }
  }

  // ── Check 3: custom rules ───────────────────────────────────

  checkRules() {
    for (const rule of this.ast.rules) {

      if (rule.forbidType === 'import') {
        for (const layer of this.ast.layers) {
          if (rule.exceptIn.includes(layer.name)) continue
          const files = this.walkFiles(layer.path)

          for (const file of files) {
            const lines = this.readFile(file).split('\n')
            lines.forEach((line, idx) => {
              const trimmed = line.trim()
              if (!trimmed.startsWith('import') && !trimmed.startsWith('from')) return
              if (line.includes(`'${rule.forbidValue}'`) || line.includes(`"${rule.forbidValue}"`)) {
                this.violations.push({
                  severity: rule.severity,
                  rule: rule.id,
                  file: file.replace(/\\/g, '/'),
                  line: idx + 1,
                  message: rule.description,
                })
              }
            })
          }
        }
      }

      if (rule.forbidType === 'pattern') {
        const targetLayers = rule.inLayers.length > 0
          ? this.ast.layers.filter(l => rule.inLayers.includes(l.name))
          : this.ast.layers

        for (const layer of targetLayers) {
          const files = this.walkFiles(layer.path)

          for (const file of files) {
            const lines = this.readFile(file).split('\n')
            lines.forEach((line, idx) => {
              const trimmed = line.trim()
              if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
              if (line.includes(rule.forbidValue)) {
                this.violations.push({
                  severity: rule.severity,
                  rule: rule.id,
                  file: file.replace(/\\/g, '/'),
                  line: idx + 1,
                  message: `${rule.description} — found "${rule.forbidValue}"`,
                })
              }
            })
          }
        }
      }
    }
  }

  run() {
    this.violations = []
    this.checkImportBoundaries()
    this.checkDirectives()
    this.checkRules()
    return this.violations
  }
}

module.exports = { Checker }
