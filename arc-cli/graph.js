// graph.js — builds import graph and detects circular dependencies

const fs = require('fs')
const path = require('path')

class ImportGraph {
  constructor(cwd) {
    this.cwd = cwd
    this.graph = new Map() // file path -> Set of imported file paths
    this.files = new Set()
  }

  /**
   * Build import graph by scanning all source files
   */
  build(layers) {
    const srcDir = path.join(this.cwd, 'src')
    if (!fs.existsSync(srcDir)) return
    
    // Collect all files from all layers
    for (const layer of layers) {
      const layerPath = path.join(this.cwd, layer.path)
      if (fs.existsSync(layerPath)) {
        this.walkDirectory(layerPath)
      }
    }
  }

  walkDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        this.walkDirectory(fullPath)
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        this.files.add(fullPath)
        this.analyzeFile(fullPath)
      }
    }
  }

  analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const imports = this.extractImports(content, filePath)
      this.graph.set(filePath, new Set(imports))
    } catch (err) {
      // Skip files that can't be read
    }
  }

  extractImports(content, fromFile) {
    const imports = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Match: import ... from '...'  or  import '...'
      const match = trimmed.match(/from\s+['"]([^'"]+)['"]/)
      if (match) {
        const importPath = match[1]
        const resolved = this.resolveImport(importPath, fromFile)
        if (resolved) imports.push(resolved)
      }
    }
    
    return imports
  }

  resolveImport(importPath, fromFile) {
    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
      return null
    }
    
    // Handle @/ alias (maps to src/)
    if (importPath.startsWith('@/')) {
      importPath = importPath.replace('@/', 'src/')
    }
    
    // Resolve relative imports
    const fromDir = path.dirname(fromFile)
    let resolved = importPath.startsWith('.')
      ? path.resolve(fromDir, importPath)
      : path.resolve(this.cwd, importPath)
    
    // Try to find the actual file
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']
    
    for (const ext of extensions) {
      const candidate = resolved + ext
      if (this.files.has(candidate)) {
        return candidate
      }
    }
    
    return null
  }

  /**
   * Detect circular imports using DFS cycle detection
   * Returns array of cycles, where each cycle is an array of file paths
   */
  detectCycles() {
    const cycles = []
    const visited = new Set()
    const recursionStack = new Set()
    const pathStack = []
    
    const dfs = (node) => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = pathStack.indexOf(node)
        if (cycleStart !== -1) {
          const cycle = pathStack.slice(cycleStart).concat([node])
          cycles.push(cycle)
        }
        return
      }
      
      if (visited.has(node)) return
      
      visited.add(node)
      recursionStack.add(node)
      pathStack.push(node)
      
      const neighbors = this.graph.get(node) || new Set()
      for (const neighbor of neighbors) {
        dfs(neighbor)
      }
      
      pathStack.pop()
      recursionStack.delete(node)
    }
    
    // Run DFS from each unvisited node
    for (const node of this.graph.keys()) {
      if (!visited.has(node)) {
        dfs(node)
      }
    }
    
    return cycles
  }

  /**
   * Find all exports in a file (for dead export detection)
   */
  findExports(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const exports = []
      const lines = content.split('\n')
      
      for (const line of lines) {
        const trimmed = line.trim()
        
        // export const/let/var/function/class/type/interface
        if (trimmed.startsWith('export ') && !trimmed.startsWith('export default')) {
          // Named export
          const match = trimmed.match(/export\s+(?:const|let|var|function|class|type|interface|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/)
          if (match) {
            exports.push({ name: match[1], type: 'named', line: trimmed })
          }
          
          // export { ... }
          const bracketMatch = trimmed.match(/export\s+\{([^}]+)\}/)
          if (bracketMatch) {
            const names = bracketMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0])
            names.forEach(name => exports.push({ name, type: 'named', line: trimmed }))
          }
        } else if (trimmed.startsWith('export default')) {
          exports.push({ name: 'default', type: 'default', line: trimmed })
        }
      }
      
      return exports
    } catch (err) {
      return []
    }
  }

  /**
   * Find dead exports (exported but never imported)
   */
  findDeadExports() {
    const deadExports = []
    const importedSymbols = new Map() // file -> Set of imported symbol names
    
    // First pass: collect all imported symbols
    for (const [fromFile, imports] of this.graph) {
      try {
        const content = fs.readFileSync(fromFile, 'utf8')
        const lines = content.split('\n')
        
        for (const line of lines) {
          // import { a, b } from '...'
          const namedImportMatch = line.match(/import\s+\{([^}]+)\}/)
          if (namedImportMatch) {
            const names = namedImportMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0])
            const importPath = line.match(/from\s+['"]([^'"]+)['"]/)?.[1]
            if (importPath) {
              const resolved = this.resolveImport(importPath, fromFile)
              if (resolved) {
                if (!importedSymbols.has(resolved)) {
                  importedSymbols.set(resolved, new Set())
                }
                names.forEach(name => importedSymbols.get(resolved).add(name))
              }
            }
          }
          
          // import X from '...'  (default import)
          const defaultImportMatch = line.match(/import\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from/)
          if (defaultImportMatch && !line.includes('{')) {
            const importPath = line.match(/from\s+['"]([^'"]+)['"]/)?.[1]
            if (importPath) {
              const resolved = this.resolveImport(importPath, fromFile)
              if (resolved) {
                if (!importedSymbols.has(resolved)) {
                  importedSymbols.set(resolved, new Set())
                }
                importedSymbols.get(resolved).add('default')
              }
            }
          }
        }
      } catch (err) {
        // Skip
      }
    }
    
    // Second pass: find exports that are never imported
    for (const file of this.files) {
      const exports = this.findExports(file)
      const imported = importedSymbols.get(file) || new Set()
      
      for (const exp of exports) {
        if (!imported.has(exp.name)) {
          deadExports.push({
            file,
            exportName: exp.name,
            line: exp.line
          })
        }
      }
    }
    
    return deadExports
  }
}

module.exports = { ImportGraph }
