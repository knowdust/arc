// lexer.js — tokenizes .arc source into a token stream

const KEYWORDS = new Set([
  'arc', 'arch', 'layer', 'rule', 'flow', 'convention', 'context', 'enforce',
  'features', 'feature', 'status', 'built', 'in-progress', 'planned',
  'files', 'actions', 'hooks', 'components', 'routes', 'depends-on', 'notes',
  'name', 'version', 'stack', 'language',
  'path', 'description', 'can', 'import', 'require', 'directive', 'filename', 'exports',
  'readonly', 'severity', 'forbid', 'pattern', 'package', 'except', 'in', 'allow',
  'steps', 'touches', 'tables', 'fields', 'layers',
  'summary', 'critical-files', 'do-not-touch',
  'error', 'warning',
  'async-function', 'type', 'interface', 'named', 'default', 'enum', 'function', 'class', 'const',
  'no-circular-imports', 'no-dead-exports', 'no-implicit-any', 'no-floating-promises',
])

function tokenize(source) {
  const tokens = []
  let i = 0
  let line = 1
  let col = 1

  const peek = (offset = 0) => source[i + offset] ?? ''
  const advance = () => {
    const ch = source[i++]
    if (ch === '\n') { line++; col = 1 } else { col++ }
    return ch
  }
  const addToken = (type, value, l = line, c = col) => tokens.push({ type, value, line: l, col: c })

  while (i < source.length) {
    const startLine = line
    const startCol = col
    const ch = peek()

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') { advance(); continue }
    if (ch === '\n') { advance(); continue }

    // Comment
    if (ch === '#') {
      while (i < source.length && peek() !== '\n') advance()
      continue
    }

    // Multiline string """..."""
    if (ch === '"' && peek(1) === '"' && peek(2) === '"') {
      advance(); advance(); advance()
      let str = ''
      while (i < source.length) {
        if (peek() === '"' && peek(1) === '"' && peek(2) === '"') {
          advance(); advance(); advance(); break
        }
        str += advance()
      }
      addToken('MULTILINE_STRING', str.trim(), startLine, startCol)
      continue
    }

    // String
    if (ch === '"') {
      advance()
      let str = ''
      while (i < source.length && peek() !== '"') str += advance()
      advance()
      addToken('STRING', str, startLine, startCol)
      continue
    }

    if (ch === '{') { advance(); addToken('LBRACE', '{', startLine, startCol); continue }
    if (ch === '}') { advance(); addToken('RBRACE', '}', startLine, startCol); continue }
    if (ch === '[') { advance(); addToken('LBRACKET', '[', startLine, startCol); continue }
    if (ch === ']') { advance(); addToken('RBRACKET', ']', startLine, startCol); continue }
    if (ch === '+') { advance(); addToken('PLUS', '+', startLine, startCol); continue }

    // Identifier or keyword
    if (/[a-zA-Z_\-]/.test(ch)) {
      let word = ''
      while (i < source.length && /[a-zA-Z0-9_\-\/\.]/.test(peek())) word += advance()
      const type = KEYWORDS.has(word) ? 'KEYWORD' : 'IDENTIFIER'
      addToken(type, word, startLine, startCol)
      continue
    }

    advance() // skip unknown
  }

  addToken('EOF', '', line, col)
  return tokens
}

module.exports = { tokenize }
