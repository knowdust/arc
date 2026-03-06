# arch — Architecture DSL for VS Code

Syntax highlighting for `.arch` architecture definition files.

## Features

- **Syntax Highlighting**: Full syntax highlighting for `.arch` files
- **Bracket Matching**: Auto-closing and matching for `{}` and `[]`
- **Comment Support**: Line comments with `#`
- **Code Folding**: Fold sections using comment markers

## Install

### Option 1: Install from source (development)

1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Linux/Windows)
3. Type "Developer: Install Extension from Location"
4. Select the `arch-vscode/` folder

### Option 2: Package and install

```bash
cd arch-vscode
npx @vscode/vsce package
code --install-extension arch-language-1.0.0.vsix
```

## Usage

Create a `project.arch` file in your project root. The extension will automatically provide syntax highlighting.

Example:

```arch
arch "my-app" {
  version  "1.0.0"
  stack    nextjs + typescript + prisma
  language typescript
}

layer lib {
  path        "src/lib"
  description "Infrastructure layer"
  can import  []
}

rule "no-console" {
  severity    warning
  description "Remove console.log statements"
  forbid pattern "console.log"
  in layers   [lib]
}
```

## Color Scopes

The extension provides the following semantic scopes:

- **Keywords**: `arch`, `layer`, `rule`, `flow`, `convention`, `context`
- **Field Keywords**: `path`, `description`, `can`, `import`, etc.
- **Constants**: `error`, `warning`, `true`, `false`
- **Strings**: Single and triple-quoted strings
- **Comments**: Line comments starting with `#`
- **Operators**: `+` for stack declarations
- **Punctuation**: `{}` and `[]` brackets

## Learn More

Visit the [arch documentation](https://github.com/knowdust/arch) to learn about the arch architecture compiler.

## License

MIT
