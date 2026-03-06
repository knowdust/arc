// checker.js — enforces .arc rules against your actual codebase

const fs   = require('fs')
const path = require('path')
const { ImportGraph } = require('./graph')

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

  // ── Check 3: filename conventions ──────────────────────────

  checkFilenameConventions() {
    for (const layer of this.ast.layers) {
      if (!layer.requireFilename) continue
      const files = this.walkFiles(layer.path)

      // Convert glob pattern to regex
      const pattern = layer.requireFilename
        .replace(/\*/g, '.*')
        .replace(/\./g, '\\.')
        .replace(/\{Name\}/g, '[A-Z][a-zA-Z0-9]*')
        .replace(/\{domain\}/g, '[a-z][a-zA-Z0-9]*')
        .replace(/\{name\}/g, '[a-zA-Z][a-zA-Z0-9\\-]*')
      
      const regex = new RegExp(`^${pattern}$`)

      for (const file of files) {
        const filename = path.basename(file)
        if (!regex.test(filename)) {
          this.violations.push({
            severity: 'error',
            rule: 'filename-convention',
            file: file.replace(/\\/g, '/'),
            message: `File "${filename}" does not match required pattern "${layer.requireFilename}" in [${layer.name}]`,
          })
        }
      }
    }
  }

  // ── Check 4: custom rules ───────────────────────────────────

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

      if (rule.forbidType === 'package') {
        for (const layer of this.ast.layers) {
          if (rule.exceptIn.includes(layer.name)) continue
          const files = this.walkFiles(layer.path)

          for (const file of files) {
            const lines = this.readFile(file).split('\n')
            lines.forEach((line, idx) => {
              const trimmed = line.trim()
              if (!trimmed.startsWith('import') && !trimmed.startsWith('from')) return
              // Match: from 'pkg' or from 'pkg/subpath'
              const pkgMatch = line.match(/from\s+['"]([^'"@.\/][^'"]*)['"]/)
              if (pkgMatch && pkgMatch[1].split('/')[0] === rule.forbidValue) {
                this.violations.push({
                  severity: rule.severity,
                  rule: rule.id,
                  file: file.replace(/\\/g, '/'),
                  line: idx + 1,
                  message: `${rule.description} — package "${rule.forbidValue}" is forbidden`,
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

  // ── Check 5: export shape violations ───────────────────────

  checkExportShapes() {
    for (const layer of this.ast.layers) {
      const hasExportRules = layer.requireExports.length > 0 || layer.allowExports.length > 0 || layer.forbidExports.length > 0
      if (!hasExportRules) continue

      const files = this.walkFiles(layer.path)

      for (const file of files) {
        const content = this.readFile(file)
        const exports = this.extractExports(content)

        for (const exp of exports) {
          // Check require exports
          if (layer.requireExports.length > 0 && !layer.requireExports.includes(exp.type)) {
            this.violations.push({
              severity: 'error',
              rule: 'export-shape',
              file: file.replace(/\\/g, '/'),
              line: exp.lineNum,
              message: `[${layer.name}] requires exports of type [${layer.requireExports.join(', ')}] — found ${exp.type}: "${exp.statement}"`,
            })
          }

          // Check allow exports
          if (layer.allowExports.length > 0 && !layer.allowExports.includes(exp.type)) {
            this.violations.push({
              severity: 'error',
              rule: 'export-shape',
              file: file.replace(/\\/g, '/'),
              line: exp.lineNum,
              message: `[${layer.name}] only allows exports of type [${layer.allowExports.join(', ')}] — found ${exp.type}: "${exp.statement}"`,
            })
          }

          // Check forbid exports
          if (layer.forbidExports.length > 0 && layer.forbidExports.includes(exp.type)) {
            this.violations.push({
              severity: 'error',
              rule: 'export-shape',
              file: file.replace(/\\/g, '/'),
              line: exp.lineNum,
              message: `[${layer.name}] forbids exports of type ${exp.type} — found: "${exp.statement}"`,
            })
          }
        }
      }
    }
  }

  extractExports(content) {
    const exports = []
    const lines = content.split('\n')

    lines.forEach((line, idx) => {
      const trimmed = line.trim()

      // export default
      if (trimmed.startsWith('export default')) {
        exports.push({ type: 'default', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export async function
      else if (trimmed.match(/^export\s+async\s+function/)) {
        exports.push({ type: 'async-function', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export function
      else if (trimmed.match(/^export\s+function/)) {
        exports.push({ type: 'function', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export class
      else if (trimmed.match(/^export\s+class/)) {
        exports.push({ type: 'class', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export const/let/var
      else if (trimmed.match(/^export\s+(const|let|var)/)) {
        exports.push({ type: 'const', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export type
      else if (trimmed.match(/^export\s+type/)) {
        exports.push({ type: 'type', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export interface
      else if (trimmed.match(/^export\s+interface/)) {
        exports.push({ type: 'interface', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export enum
      else if (trimmed.match(/^export\s+enum/)) {
        exports.push({ type: 'enum', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
      // export { ... }
      else if (trimmed.match(/^export\s+\{/)) {
        exports.push({ type: 'named', statement: trimmed.substring(0, 50), lineNum: idx + 1 })
      }
    })

    return exports
  }

  // ── Check 6: circular imports ──────────────────────────────

  checkCircularImports() {
    if (!this.ast.enforcements.noCircularImports) return

    const graph = new ImportGraph(this.cwd)
    graph.build(this.ast.layers)
    const cycles = graph.detectCycles()

    for (const cycle of cycles) {
      const cycleStr = cycle.map(f => path.relative(this.cwd, f)).join(' → ')
      this.violations.push({
        severity: 'error',
        rule: 'circular-import',
        file: path.relative(this.cwd, cycle[0]).replace(/\\/g, '/'),
        message: `Circular import detected: ${cycleStr}`,
      })
    }
  }

  // ── Check 7: dead exports ──────────────────────────────────

  checkDeadExports() {
    if (!this.ast.enforcements.noDeadExports) return

    const graph = new ImportGraph(this.cwd)
    graph.build(this.ast.layers)
    const deadExports = graph.findDeadExports()

    for (const dead of deadExports) {
      this.violations.push({
        severity: 'warning',
        rule: 'dead-export',
        file: path.relative(this.cwd, dead.file).replace(/\\/g, '/'),
        message: `Exported symbol "${dead.exportName}" is never imported — consider removing: ${dead.line.substring(0, 50)}`,
      })
    }
  }

  run() {
    this.violations = []
    this.checkImportBoundaries()      // Pass 1
    this.checkDirectives()            // Pass 2
    this.checkFilenameConventions()   // Pass 3
    this.checkRules()                 // Pass 4
    this.checkExportShapes()          // Pass 5
    this.checkCircularImports()       // Pass 6
    this.checkDeadExports()           // Pass 7
    return this.violations
  }
}

module.exports = { Checker }
