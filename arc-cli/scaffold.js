// scaffold.js — generates new files following conventions

const fs   = require('fs')
const path = require('path')

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function scaffold(ast, cwd, type, name) {
  if (!type || !name) {
    console.error('Usage: arc scaffold <type> <name>')
    console.error('Types: action, hook, component')
    process.exit(1)
  }

  // Find the convention for this type
  const convention = ast.conventions.find(c => c.name.includes(type))
  
  let filePath = ''
  let content = ''

  if (type === 'action') {
    // src/actions/{domain}.ts
    filePath = path.join(cwd, 'src/actions', `${name}.ts`)
    const domainCap = capitalize(name)
    content = `'use server'
import { prisma } from '@/lib/db'
import type { ActionResult } from '@/types'

export async function get${domainCap}(): Promise<ActionResult<any>> {
  try {
    return { success: true, data: null }
  } catch (error) {
    return { success: false, error: 'Failed' }
  }
}
`
  } else if (type === 'hook') {
    // src/hooks/use{Name}.ts
    const nameCap = capitalize(name)
    filePath = path.join(cwd, 'src/hooks', `use${nameCap}.ts`)
    content = `'use client'
import { useState, useEffect } from 'react'

export function use${nameCap}() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // TODO
  }, [])

  return { data, loading, error }
}
`
  } else if (type === 'component') {
    // src/components/app/{Name}.tsx
    const nameCap = capitalize(name)
    filePath = path.join(cwd, 'src/components/app', `${nameCap}.tsx`)
    content = `type ${nameCap}Props = {
  // TODO
}

export function ${nameCap}({}: ${nameCap}Props) {
  return (
    <div>
      {/* TODO */}
    </div>
  )
}
`
  } else {
    console.error(`Unknown scaffold type: ${type}`)
    console.error('Available types: action, hook, component')
    process.exit(1)
  }

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(`\x1b[31m✗  File already exists: ${filePath}\x1b[0m`)
    process.exit(1)
  }

  // Create parent directories
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Write file
  fs.writeFileSync(filePath, content)
  console.log(`\x1b[32m✓  Created ${path.relative(cwd, filePath)}\x1b[0m`)
}

module.exports = { scaffold }
