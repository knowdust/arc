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
      throw new Error(`[arc] Line ${tok.line}: expected ${type} but got ${tok.type} ("${tok.value}")`)
    if (value !== undefined && tok.value !== value)
      throw new Error(`[arc] Line ${tok.line}: expected "${value}" but got "${tok.value}"`)
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

  parseValueList() {
    if (this.check('LBRACKET')) return this.parseStringList()
    const tok = this.advance()
    if (['STRING', 'IDENTIFIER', 'KEYWORD'].includes(tok.type)) return [tok.value]
    return []
  }

  skipBalancedBraces() {
    if (!this.eatIf('LBRACE')) return
    let depth = 1
    while (depth > 0 && !this.check('EOF')) {
      const tok = this.advance()
      if (tok.type === 'LBRACE') depth++
      if (tok.type === 'RBRACE') depth--
    }
  }

  skipBracketList() {
    if (!this.eatIf('LBRACKET')) return
    let depth = 1
    while (depth > 0 && !this.check('EOF')) {
      const tok = this.advance()
      if (tok.type === 'LBRACKET') depth++
      if (tok.type === 'RBRACKET') depth--
    }
  }

  skipUnknownInsideBlock() {
    if (this.check('STRING') || this.check('IDENTIFIER') || this.check('KEYWORD')) {
      this.advance()
    }
    if (this.check('LBRACKET')) this.skipBracketList()
    if (this.check('LBRACE')) this.skipBalancedBraces()
  }

  skipUnknownTopLevel() {
    if (this.check('LBRACE')) {
      this.skipBalancedBraces()
      return
    }
    if (this.check('STRING') || this.check('IDENTIFIER') || this.check('KEYWORD')) {
      this.advance()
    }
    if (this.check('LBRACKET')) this.skipBracketList()
  }

  parseProject() {
    const id = this.expect('STRING').value
    this.expect('LBRACE')
    let name = id, version = '1.0.0', stack = [], language = 'typescript'

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'name') {
        name = this.expect('STRING').value
      } else if (key.value === 'version') {
        version = this.expect('STRING').value
      } else if (key.value === 'stack') {
        if (this.check('LBRACKET')) {
          stack = this.parseStringList()
        } else {
          const items = []
          while (!this.check('LBRACE') && !this.check('RBRACE') && !this.check('EOF')) {
            const tok = this.advance()
            if (tok.type === 'IDENTIFIER' || tok.type === 'KEYWORD') items.push(tok.value)
            else if (tok.type === 'PLUS') continue
            else break
          }
          stack = items
        }
      } else if (key.value === 'language') {
        language = this.advance().value
      }
    }
    this.expect('RBRACE')
    return { id, name, version, stack, language }
  }

  parseLayer() {
    const name = this.advance().value
    this.expect('LBRACE')
    let path = '', description = '', canImport = [], directive = null, readonly = false
    let requireFilename = null, requireExports = [], allowExports = [], forbidExports = []

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'path')        { path = this.expect('STRING').value }
      else if (key.value === 'description') { description = this.expect('STRING').value }
      else if (key.value === 'can')    { this.eatIf('KEYWORD', 'import'); canImport = this.parseStringList() }
      else if (key.value === 'require'){
        const next = this.peek()
        if (next.value === 'directive') {
          this.advance()
          directive = this.expect('STRING').value
        } else if (next.value === 'filename') {
          this.advance()
          requireFilename = this.expect('STRING').value
        } else if (next.value === 'exports') {
          this.advance()
          requireExports = this.parseValueList()
        }
      }
      else if (key.value === 'allow') {
        this.eatIf('KEYWORD', 'exports')
        allowExports = this.parseValueList()
      }
      else if (key.value === 'forbid' && this.check('KEYWORD', 'exports')) {
        this.advance()
        forbidExports = this.parseValueList()
      }
      else if (key.value === 'readonly'){ readonly = true }
      else { this.skipUnknownInsideBlock() }
    }
    this.expect('RBRACE')
    return { name, path, description, canImport, directive, readonly, requireFilename, requireExports, allowExports, forbidExports }
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
        if (sub.value === 'pattern') forbidType = 'pattern'
        else if (sub.value === 'package') forbidType = 'package'
        else forbidType = 'import'
        forbidValue = this.expect('STRING').value
      }
      else if (key.value === 'except') { this.eatIf('KEYWORD', 'in'); exceptIn = this.parseStringList() }
      else if (key.value === 'in')     { this.eatIf('KEYWORD', 'layers'); inLayers = this.parseStringList() }
      else { this.skipUnknownInsideBlock() }
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
      else { this.skipUnknownInsideBlock() }
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
      else { this.skipUnknownInsideBlock() }
    }
    this.expect('RBRACE')
    return { summary, criticalFiles, doNotTouch }
  }

  parseFeatures() {
    this.expect('LBRACE')
    const features = []

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const tok = this.advance()
      if (tok.value === 'feature') {
        features.push(this.parseFeature())
      } else {
        this.skipUnknownInsideBlock()
      }
    }

    this.expect('RBRACE')
    return features
  }

  parseFeature() {
    const nameTok = this.advance()
    const name = nameTok.value
    this.expect('LBRACE')

    let description = ''
    let status = 'planned'
    let layer = null
    let files = []
    let actions = []
    let hooks = []
    let components = []
    let routes = []
    let tables = []
    let dependsOn = []
    let notes = null

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const key = this.advance()
      if (key.value === 'description') description = this.expect('STRING').value
      else if (key.value === 'status') status = this.advance().value
      else if (key.value === 'layer') layer = this.advance().value
      else if (key.value === 'files') files = this.parseStringList()
      else if (key.value === 'actions') actions = this.parseStringList()
      else if (key.value === 'hooks') hooks = this.parseStringList()
      else if (key.value === 'components') components = this.parseStringList()
      else if (key.value === 'routes') routes = this.parseStringList()
      else if (key.value === 'tables') tables = this.parseStringList()
      else if (key.value === 'depends-on') dependsOn = this.parseStringList()
      else if (key.value === 'notes') notes = this.expect('STRING').value
      else this.skipUnknownInsideBlock()
    }

    this.expect('RBRACE')
    return { name, description, status, layer, files, actions, hooks, components, routes, tables, dependsOn, notes }
  }

  parse() {
    const ast = { 
      project: null, 
      layers: [], 
      rules: [], 
      flows: [], 
      conventions: [], 
      context: null,
      features: [],
      enforcements: {
        noCircularImports: false,
        noDeadExports: false,
        noImplicitAny: false,
        noFloatingPromises: false
      }
    }

    while (!this.check('EOF')) {
      const tok = this.advance()
      if (tok.value === 'arc' || tok.value === 'arch') ast.project = this.parseProject()
      else if (tok.value === 'layer')  ast.layers.push(this.parseLayer())
      else if (tok.value === 'rule')   ast.rules.push(this.parseRule())
      else if (tok.value === 'flow')   ast.flows.push(this.parseFlow())
      else if (tok.value === 'convention') ast.conventions.push(this.parseConvention())
      else if (tok.value === 'context') ast.context = this.parseContext()
      else if (tok.value === 'features') ast.features = this.parseFeatures()
      else if (tok.value === 'enforce') {
        const enforcementType = this.advance().value
        if (enforcementType === 'no-circular-imports') ast.enforcements.noCircularImports = true
        else if (enforcementType === 'no-dead-exports') ast.enforcements.noDeadExports = true
        else if (enforcementType === 'no-implicit-any') ast.enforcements.noImplicitAny = true
        else if (enforcementType === 'no-floating-promises') ast.enforcements.noFloatingPromises = true
      } else {
        this.skipUnknownTopLevel()
      }
    }

    return ast
  }
}

module.exports = { Parser }
