// parser.js — converts token stream into AST

class Parser {
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  peek()    { return this.tokens[this.pos] }
  advance() { return this.tokens[this.pos++] }

  expect(type, value) {
    const tok = this.advance()
    if (tok.type !== type)
      throw new Error(`[arch] Line ${tok.line}: expected ${type} but got ${tok.type} ("${tok.value}")`)
    if (value !== undefined && tok.value !== value)
      throw new Error(`[arch] Line ${tok.line}: expected "${value}" but got "${tok.value}"`)
    return tok
  }

  check(type, value) {
    const tok = this.peek()
    if (tok.type !== type) return false
    if (value !== undefined && tok.value !== value) return false
    return true
  }

  eatIf(type, value) {
    if (this.check(type, value)) { this.advance(); return true }
    return false
  }

  parseStringList() {
    this.expect('LBRACKET')
    const items = []
    while (!this.check('RBRACKET') && !this.check('EOF')) {
      const tok = this.advance()
      if (['STRING', 'IDENTIFIER', 'KEYWORD'].includes(tok.type)) items.push(tok.value)
    }
    this.expect('RBRACKET')
    return items
  }

  parseProject() {
    const name = this.expect('STRING').value
    this.expect('LBRACE')
    let version = '1.0.0', stack = [], language = 'typescript'

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'version') {
        version = this.expect('STRING').value
      } else if (key.value === 'stack') {
        const items = []
        while (!this.check('LBRACE') && !this.check('RBRACE') && !this.check('EOF')) {
          const tok = this.advance()
          if (tok.type === 'IDENTIFIER' || tok.type === 'KEYWORD') items.push(tok.value)
          else if (tok.type === 'PLUS') continue
          else break
        }
        stack = items
      } else if (key.value === 'language') {
        language = this.advance().value
      }
    }
    this.expect('RBRACE')
    return { name, version, stack, language }
  }

  parseLayer() {
    const name = this.advance().value
    this.expect('LBRACE')
    let path = '', description = '', canImport = [], directive = null, readonly = false

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'path')        { path = this.expect('STRING').value }
      else if (key.value === 'description') { description = this.expect('STRING').value }
      else if (key.value === 'can')    { this.eatIf('KEYWORD', 'import'); canImport = this.parseStringList() }
      else if (key.value === 'require'){ this.eatIf('KEYWORD', 'directive'); directive = this.expect('STRING').value }
      else if (key.value === 'readonly'){ readonly = true }
    }
    this.expect('RBRACE')
    return { name, path, description, canImport, directive, readonly }
  }

  parseRule() {
    const id = this.expect('STRING').value
    this.expect('LBRACE')
    let severity = 'error', description = '', forbidType = 'import', forbidValue = '', exceptIn = [], inLayers = []

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'severity')    { severity = this.advance().value }
      else if (key.value === 'description') { description = this.expect('STRING').value }
      else if (key.value === 'forbid') {
        const sub = this.advance()
        forbidType = sub.value === 'pattern' ? 'pattern' : 'import'
        forbidValue = this.expect('STRING').value
      }
      else if (key.value === 'except') { this.eatIf('KEYWORD', 'in'); exceptIn = this.parseStringList() }
      else if (key.value === 'in')     { this.eatIf('KEYWORD', 'layers'); inLayers = this.parseStringList() }
    }
    this.expect('RBRACE')
    return { id, severity, description, forbidType, forbidValue, exceptIn, inLayers }
  }

  parseFlow() {
    const name = this.advance().value
    this.expect('LBRACE')
    let description = '', steps = [], touches = [], tables = [], fields = []

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'description') { description = this.expect('STRING').value }
      else if (key.value === 'steps')  { steps = this.parseStringList() }
      else if (key.value === 'touches'){ touches = this.parseStringList() }
      else if (key.value === 'tables') { tables = this.parseStringList() }
      else if (key.value === 'fields') { fields = this.parseStringList() }
    }
    this.expect('RBRACE')
    return { name, description, steps, touches, tables, fields }
  }

  parseConvention() {
    const name = this.advance().value
    const pattern = this.expect('STRING').value
    return { name, pattern }
  }

  parseContext() {
    this.expect('LBRACE')
    let summary = '', criticalFiles = [], doNotTouch = []

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'summary')          { summary = this.expect('MULTILINE_STRING').value }
      else if (key.value === 'critical-files') { criticalFiles = this.parseStringList() }
      else if (key.value === 'do-not-touch')   { doNotTouch = this.parseStringList() }
    }
    this.expect('RBRACE')
    return { summary, criticalFiles, doNotTouch }
  }

  parse() {
    const ast = { project: null, layers: [], rules: [], flows: [], conventions: [], context: null }

    while (!this.check('EOF')) {
      const tok = this.advance()
      if (tok.value === 'arch')        ast.project = this.parseProject()
      else if (tok.value === 'layer')  ast.layers.push(this.parseLayer())
      else if (tok.value === 'rule')   ast.rules.push(this.parseRule())
      else if (tok.value === 'flow')   ast.flows.push(this.parseFlow())
      else if (tok.value === 'convention') ast.conventions.push(this.parseConvention())
      else if (tok.value === 'context') ast.context = this.parseContext()
    }

    return ast
  }
}

module.exports = { Parser }
