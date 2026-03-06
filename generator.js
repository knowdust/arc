// generator.js — generates .arc file from package.json

const fs   = require('fs')
const path = require('path')

function generateArch(cwd) {
  const packagePath = path.join(cwd, 'package.json')
  if (!fs.existsSync(packagePath)) {
    console.error('✗  No package.json found')
    process.exit(1)
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  
  // Extract tech stack from dependencies
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const stack = extractStack(deps)
  
  // Detect if TypeScript
  const language = deps.typescript ? 'typescript' : 'javascript'
  
  // Generate layers based on common structure
  const layers = generateLayers()
  
  // Generate rules
  const rules = generateRules(stack)
  
  // Generate arch content
  const archContent = `# .arc — Architecture definition
# Generated from package.json on ${new Date().toISOString()}
# Run: pnpm arch:generate to update

arch "${pkg.name}" {
  version  "${pkg.version}"
  stack    ${stack.join(' + ')}
  language ${language}
}

${layers}

${rules}

context {
  summary """
    ${pkg.description || pkg.name} application.
    Built with ${stack.slice(0, 3).join(', ')}.
  """
  
  critical-files [
    "package.json"
    "src/types/index.ts"
    "src/lib/db.ts"
  ]
  
  do-not-touch [
    "src/components/ui/"
  ]
}
`

  const arcFile = path.join(cwd, '.arc')
  fs.writeFileSync(arcFile, archContent)
  
  return {
    file: '.arc',
    path: arcFile,
    content: archContent
  }
}

function extractStack(deps) {
  const stack = []
  
  // Framework
  if (deps.next) stack.push('nextjs')
  else if (deps.react) stack.push('react')
  else if (deps.vue) stack.push('vue')
  else if (deps.svelte) stack.push('svelte')
  else if (deps.astro) stack.push('astro')
  else if (deps.remix) stack.push('remix')
  
  // Language
  if (deps.typescript) stack.push('typescript')
  
  // ORM
  if (deps['@prisma/client']) stack.push('prisma')
  else if (deps.typeorm) stack.push('typeorm')
  else if (deps.sequelize) stack.push('sequelize')
  
  // Database
  if (deps['@supabase/supabase-js']) stack.push('supabase')
  else if (deps.mongodb) stack.push('mongodb')
  else if (deps.firebase) stack.push('firebase')
  else if (deps.pg) stack.push('postgres')
  
  // UI
  if (deps['@radix-ui/react-slot']) stack.push('shadcn')
  if (deps.tailwindcss) stack.push('tailwind')
  if (deps['@emotion/react']) stack.push('emotion')
  if (deps['styled-components']) stack.push('styled-components')
  
  // Auth
  if (deps['@auth/core']) stack.push('authjs')
  if (deps['next-auth']) stack.push('nextauth')
  
  // State
  if (deps.zustand) stack.push('zustand')
  else if (deps.jotai) stack.push('jotai')
  else if (deps.recoil) stack.push('recoil')
  else if (deps.redux) stack.push('redux')
  
  // API
  if (deps.axios) stack.push('axios')
  if (deps['@tanstack/react-query']) stack.push('tanstack-query')
  if (deps.swr) stack.push('swr')
  
  // Testing
  if (deps.jest) stack.push('jest')
  if (deps.vitest) stack.push('vitest')
  if (deps.cypress) stack.push('cypress')
  if (deps.playwright) stack.push('playwright')
  
  // Linting
  if (deps.eslint) stack.push('eslint')
  if (deps.prettier) stack.push('prettier')
  
  return stack.length > 0 ? stack : ['node', 'javascript']
}

function generateLayers() {
  return `# ── Layers ────────────────────────────────────────

layer types {
  path        "src/types"
  description "TypeScript type definitions"
  can import  []
}

layer lib {
  path        "src/lib"
  description "Utilities and infrastructure"
  can import  [types]
}

layer hooks {
  path        "src/hooks"
  description "React hooks"
  can import  [types, lib]
  require directive "use client"
}

layer actions {
  path        "src/actions"
  description "Server actions"
  can import  [types, lib]
  require directive "use server"
}

layer components {
  path        "src/components/app"
  description "Application components"
  can import  [types, hooks, lib]
}

layer ui {
  path        "src/components/ui"
  description "UI component library"
  can import  [types]
  readonly
}

layer pages {
  path        "src/app"
  description "Next.js pages and routes"
  can import  [types, hooks, components, actions, lib]
}`
}

function generateRules() {
  return `# ── Rules ────────────────────────────────────────

rule "no-db-in-components" {
  severity    error
  description "Database access only in actions/lib"
  forbid import "@/lib/db"
  except in   [lib, actions]
}

rule "no-console-logs" {
  severity    warning
  description "Remove console.log statements"
  forbid pattern "console.log"
  in layers   [components, pages]
}

rule "no-any-types" {
  severity    warning
  description "Use proper types instead of any"
  forbid pattern ": any"
  in layers   [types, actions]
}`
}

function generateConfig(pkg) {
  return `// arch.config.ts — Architecture enforcement configuration
// Generated from package.json on ${new Date().toISOString()}
// Customize which folders and files arch should check

export const archConfig = {
  // Project info
  name: "${pkg.name}",
  version: "${pkg.version}",
  
  // Folders to enforce architecture rules on
  includePaths: [
    "src/types",
    "src/lib",
    "src/hooks",
    "src/actions",
    "src/components",
    "src/app",
    "src/utils",
    "src/contexts",
    "src/store",
  ],
  
  // Folders/files to exclude from architecture checks
  excludePaths: [
    "node_modules",
    ".next",
    ".arch",
    "dist",
    "build",
    "out",
    "coverage",
    ".git",
    "public",
    "scripts",
    "prisma/migrations",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/__tests__/**",
    "**/__mocks__/**",
  ],
  
  // File patterns to check (glob patterns)
  filePatterns: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
  ],
  
  // Architecture file to use
  architectureFile: ".arc", // Can change to "project.arch" if preferred
  
  // Enforcement options
  options: {
    // Fail build on warnings (false = only fail on errors)
    failOnWarnings: false,
    
    // Show detailed violation messages
    verbose: true,
    
    // Auto-fix violations where possible (future feature)
    autoFix: false,
    
    // Generate violation reports
    reports: {
      enabled: false,
      outputPath: ".arch/violations.json",
    },
  },
  
  // Custom layer configurations (override defaults)
  customLayers: {
    // Example: Add a custom layer
    // middleware: {
    //   path: "src/middleware",
    //   canImport: ["types", "lib"],
    // },
  },
  
  // Custom rules (in addition to .arc file)
  customRules: [
    // Example custom rules:
    // {
    //   id: "no-lodash",
    //   severity: "warning",
    //   description: "Use native JS instead of lodash",
    //   forbidImport: "lodash",
    //   exceptIn: [],
    // },
  ],
} as const

export default archConfig
`
}

module.exports = { generateArch }
