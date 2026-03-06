# arch-cli

Architecture compiler for your codebase — enforces rules at build time.

## Quick Start

```bash
# From your project root:
node arch-cli/arch.js check    # Validate architecture
node arch-cli/arch.js map      # Generate docs
node arch-cli/arch.js print    # View architecture
node arch-cli/arch.js scaffold <type> <name>  # Create files
```

## Installation

1. Copy this `arch-cli/` folder to your project root
2. Create a `project.arch` file at your project root (see example below)
3. Add to your `package.json`:

```json
{
  "scripts": {
    "build": "node arch-cli/arch.js check && next build",
    "arch:check": "node arch-cli/arch.js check",
    "arch:map": "node arch-cli/arch.js map",
    "arch:print": "node arch-cli/arch.js print"
  }
}
```

## Requirements

- Node.js ≥ 18.0.0
- No npm dependencies required

## Example project.arch

See `project.arch` in this directory for a complete example.

## Documentation

See the parent directory for complete documentation:

- `../README.md` - Overview and features
- `../INSTALL.md` - Installation and usage guide
- `../arch.md` - Full specification

## License

MIT
