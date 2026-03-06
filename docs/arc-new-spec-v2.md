# Great question. Let me think through this systematically — what's universal to JS/TS, what's stack-specific, and what common project archetypes look like

---

## Part 1 — Universal JS/TS Architectural Rules

These apply regardless of stack.

### 1.1 Import/Export Rules

- **Import direction** — layer A can only import from allowed layers
- **Circular imports** — A→B→A, detected via graph traversal
- **Wildcard imports** — forbid `import * as X` (hides what's actually used)
- **Default vs named exports** — enforce consistency per layer (e.g. components always default export, utils always named)
- **Re-export barrels** — require or forbid `index.ts` barrel files per layer
- **Deep imports** — forbid `import x from '@/lib/db/internal/pool'` (only public surface)
- **Self imports** — a file importing itself

### 1.2 File & Folder Rules

- **File in wrong layer** — `db.ts` sitting in `components/`
- **Naming conventions** — `useX.ts`, `XService.ts`, `X.test.ts`
- **File extension correctness** — `.ts` vs `.tsx` (JSX only in `.tsx`)
- **Index file rules** — every folder has one, or none do
- **Max files per folder** — a folder with 40 files is a design smell
- **Co-location rules** — test file must live next to source file

### 1.3 Export Shape Rules

- **Layer export types** — `types/` exports only `type`/`interface`/`enum`, never functions
- **Async enforcement** — all exports from `actions/` must be `async function`
- **Class vs function** — enforce one style per layer
- **No anonymous exports** — `export default function()` without a name
- **No mixed exports** — a file either has a default export or named exports, not both

### 1.4 Code Pattern Rules

- **No `any` type** — `: any`, `as any`, `<any>`
- **No non-null assertion abuse** — `value!` in certain layers
- **No `console.log`** — in production layers
- **No commented-out code** — `// const old = ...`
- **No hardcoded secrets** — `password`, `api_key`, `secret` as string literals
- **No hardcoded URLs** — `http://` or `https://` literals outside config files
- **No `TODO`/`FIXME`** — in certain layers (optional, team preference)
- **No `debugger` statements**
- **No `eval()`**
- **No `document`/`window` in server code** — browser globals in non-client files

### 1.5 TypeScript-Specific Rules

- **Strict null checks respected** — no `!` assertions in data layers
- **No `@ts-ignore`** — in critical layers
- **No `@ts-nocheck`** — anywhere
- **Explicit return types** — required on exported functions in `lib/` and `actions/`
- **No implicit any from parameters** — function parameters must be typed
- **Enum vs const object** — enforce one style
- **Type vs Interface** — enforce one style per layer

### 1.6 Async/Concurrency Rules

- **No floating promises** — `asyncFn()` without `await` or `.catch()`
- **No `async` without `await`** — pointless async
- **No `await` in loops** — use `Promise.all` instead
- **No `setTimeout`/`setInterval`** in certain layers

### 1.7 Environment Rules

- **`process.env` only in config layer** — not scattered everywhere
- **No direct `process.env` in client bundles** — leaks undefined at runtime
- **All env vars through a typed config object** — `config.databaseUrl` not `process.env.DATABASE_URL`

### 1.8 Dependency Rules

- **No forbidden packages** — e.g. `moment` (use `date-fns`), `lodash` (use native)
- **No dev dependencies in production code** — `import jest` in non-test file
- **No direct `node_modules` imports** — `import x from '../../node_modules/pkg'`
- **Package allowed list** — only these packages allowed in this layer

### 1.9 Test Rules

- **Test files must be co-located** or all in `__tests__/` — pick one
- **No test code in source files** — `if (process.env.NODE_ENV === 'test')`
- **Every exported function in `lib/` must have a test file**
- **Mock boundaries** — only mock at layer boundaries, not inside layers

### 1.10 Dead Code Rules

- **Exported but never imported** — dead exports
- **Imported but never used** — dead imports (tsc catches some, not all)
- **Unreachable code after return**

---

## Part 2 — Stack-Specific Rules

### Next.js App Router

- Server components cannot import client hooks (`useState`, `useEffect`)
- `'use client'` files cannot be async components
- `'use server'` files must only export async functions
- API routes must export named HTTP methods (`GET`, `POST`, not default)
- `page.tsx` must have a default export
- `layout.tsx` must accept `children` prop
- No `getServerSideProps` / `getStaticProps` (App Router, not Pages)
- Metadata must be exported from page files
- No `next/router` in App Router (use `next/navigation`)

### React (any)

- Components must be PascalCase
- Hooks must start with `use`
- No logic in JSX (ternary ok, complex logic → extract)
- No inline styles (use CSS modules or Tailwind)
- Props interfaces must be named `XProps`
- No `React.FC` (use plain function)
- Context providers must live in `providers/`

### Node.js / Express API

- Route handlers must not contain business logic (delegate to service layer)
- Controllers only call services, never repositories directly
- Repositories only import the DB client
- Services must not import Express types (`Request`, `Response`)
- Middleware must be in `middleware/`
- No `try/catch` in routes — use error middleware

### Pure JS (HTML + CSS + JS)

- No ES modules mixed with CommonJS
- No global variable declarations (`var x =` at top level)
- DOM manipulation only in UI layer
- No business logic in event listeners
- CSS class names follow BEM or kebab-case convention

### CLI Tools (Node.js)

- `bin/` entry point only parses args and delegates
- No I/O in core logic files
- Config loaded once at startup, passed down
- No `process.exit()` outside of `bin/`

---

## Part 3 — Arc Templates by Project Type

---

### Template 1 — Pure HTML + CSS + JS (Vanilla)

```arc
arc "vanilla-app" {
  version  "1.0.0"
  stack    html + css + javascript
  language javascript
}

layer config {
  path        "src/config"
  description "App configuration and constants. No DOM access."
  can import  []
}

layer utils {
  path        "src/utils"
  description "Pure functions. No DOM. No side effects."
  can import  [config]
}

layer api {
  path        "src/api"
  description "HTTP calls only. Returns raw data. No DOM."
  can import  [config, utils]
}

layer state {
  path        "src/state"
  description "Application state management. No DOM manipulation."
  can import  [config, utils]
}

layer ui {
  path        "src/ui"
  description "DOM manipulation, event listeners, rendering."
  can import  [config, utils, api, state]
}

layer main {
  path        "src/main.js"
  description "Entry point. Wires everything together."
  can import  [config, utils, api, state, ui]
}

rule "no-dom-in-utils" {
  severity    error
  description "Pure utility functions must not touch the DOM"
  forbid pattern "document."
  in layers   [utils, api, state, config]
}

rule "no-fetch-in-ui" {
  severity    error
  description "UI layer must not make HTTP calls directly — use api layer"
  forbid pattern "fetch("
  in layers   [ui]
}

rule "no-global-var" {
  severity    warning
  description "Avoid global var declarations"
  forbid pattern "var "
  in layers   [utils, api, state, ui]
}

rule "no-console" {
  severity    warning
  description "Remove debug console statements"
  forbid pattern "console.log"
  in layers   [utils, api, state, ui]
}

flow data-display {
  description "Fetch data from API → update state → UI renders from state"
  steps [
    "ui/index.js initializes on DOMContentLoaded"
    "calls api/users.js fetchUsers()"
    "stores result in state/appState.js"
    "ui/components/userList.js reads state and renders DOM"
  ]
  touches ["src/api/users.js", "src/state/appState.js", "src/ui/components/userList.js"]
}

convention util      "src/utils/{name}.js"
convention api       "src/api/{resource}.js"
convention component "src/ui/components/{name}.js"
```

---

### Template 2 — React SPA (Vite + React + TypeScript)

```arc
arc "react-spa" {
  version  "1.0.0"
  stack    react + typescript + vite + react-query + zustand
  language typescript
}

layer types {
  path        "src/types"
  description "TypeScript types and interfaces only. Zero logic."
  can import  []
}

layer config {
  path        "src/config"
  description "Environment config, constants, feature flags."
  can import  [types]
}

layer utils {
  path        "src/utils"
  description "Pure functions. Framework-agnostic. Fully testable."
  can import  [types, config]
}

layer api {
  path        "src/api"
  description "API client functions. Returns typed data. No React."
  can import  [types, config, utils]
}

layer store {
  path        "src/store"
  description "Zustand global state. No direct API calls."
  can import  [types, config]
}

layer hooks {
  path        "src/hooks"
  description "React Query hooks + custom hooks. Bridges API and components."
  can import  [types, config, utils, api, store]
}

layer components {
  path        "src/components"
  description "Reusable UI components. No direct API calls. No store writes."
  can import  [types, utils, hooks, config]
}

layer pages {
  path        "src/pages"
  description "Route-level components. Compose components. May read store."
  can import  [types, utils, hooks, components, store, config]
}

layer app {
  path        "src/App.tsx"
  description "Root component. Router setup. Provider wrapping."
  can import  [types, pages, components, store, config, hooks]
}

rule "no-api-in-components" {
  severity    error
  description "Components must not call API directly — use hooks"
  forbid import "@/api"
  except in   [hooks, pages]
}

rule "no-store-writes-in-components" {
  severity    warning
  description "Components should not write to store directly — use hooks"
  forbid pattern "useStore.setState"
  in layers   [components]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, api, hooks, utils]
}

rule "no-inline-styles" {
  severity    warning
  description "Use CSS modules or Tailwind — no inline style objects"
  forbid pattern "style={{"
  in layers   [components, pages]
}

rule "hooks-prefix" {
  severity    error
  description "Custom hooks must start with use"
  require filename "use*.ts"
  in layers   [hooks]
}

convention hook       "src/hooks/use{Resource}.ts"
convention component  "src/components/{Name}/{Name}.tsx"
convention page       "src/pages/{Name}Page.tsx"
convention api        "src/api/{resource}.api.ts"
convention store      "src/store/{domain}.store.ts"
convention type       "src/types/{domain}.types.ts"

flow data-fetch {
  description "Component renders → hook fires → React Query fetches → component updates"
  steps [
    "page mounts"
    "useUsers() hook fires"
    "React Query calls api/users.api.ts"
    "data cached in React Query store"
    "component re-renders with data"
  ]
}
```

---

### Template 3 — Next.js App Router (Full-Stack)

```arc
arc "nextjs-app" {
  version  "1.0.0"
  stack    nextjs + typescript + prisma + postgres + shadcn + tailwind
  language typescript
}

layer types {
  path        "src/types"
  description "All TypeScript types. No logic, no imports from app."
  can import  []
}

layer config {
  path        "src/config"
  description "Typed env vars, constants. Single access point for process.env."
  can import  [types]
}

layer db {
  path        "src/lib/db.ts"
  description "Prisma client singleton. Only file that instantiates Prisma."
  can import  [config]
}

layer lib {
  path        "src/lib"
  description "Server-side infrastructure: email, storage, payment clients."
  can import  [types, config, db]
}

layer actions {
  path        "src/actions"
  description "Next.js Server Actions. All DB access lives here."
  can import  [types, config, lib, db]
  require directive "use server"
}

layer hooks {
  path        "src/hooks"
  description "React hooks for client-side state."
  can import  [types, config]
  require directive "use client"
}

layer components {
  path        "src/components/app"
  description "App UI components. No Prisma. No direct DB."
  can import  [types, hooks, config]
}

layer ui {
  path        "src/components/ui"
  description "shadcn/ui — never edit manually."
  can import  [types]
  readonly
}

layer app {
  path        "src/app"
  description "Pages, layouts, API routes."
  can import  [types, config, hooks, components, actions, lib]
}

rule "no-prisma-in-components" {
  severity    error
  description "Prisma only in db.ts and actions"
  forbid import "@prisma/client"
  except in   [db, actions, lib]
}

rule "no-process-env-scatter" {
  severity    error
  description "Access env vars through src/config only"
  forbid pattern "process.env."
  in layers   [actions, hooks, components, app]
}

rule "no-next-router-in-app-router" {
  severity    error
  description "Use next/navigation not next/router in App Router"
  forbid import "next/router"
  except in   []
}

rule "no-server-code-in-client" {
  severity    error
  description "Server-only imports cannot be in client components"
  forbid import "server-only"
  except in   [actions, lib, db]
}

rule "no-any" {
  severity    warning
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, actions, lib, hooks]
}

convention action     "src/actions/{domain}.ts"
convention hook       "src/hooks/use{Name}.ts"
convention component  "src/components/app/{Name}.tsx"
convention api-route  "src/app/api/{path}/route.ts"
convention page       "src/app/{path}/page.tsx"
```

---

### Template 4 — Node.js REST API (Express + TypeScript)

```arc
arc "express-api" {
  version  "1.0.0"
  stack    nodejs + express + typescript + prisma + postgres
  language typescript
}

layer types {
  path        "src/types"
  description "Shared types. No Express types allowed here."
  can import  []
}

layer config {
  path        "src/config"
  description "All env vars accessed here. Validated at startup."
  can import  [types]
}

layer db {
  path        "src/db"
  description "Prisma client. DB connection only."
  can import  [config]
}

layer repositories {
  path        "src/repositories"
  description "Data access layer. Prisma queries. Returns domain objects."
  can import  [types, config, db]
}

layer services {
  path        "src/services"
  description "Business logic. No Express types. No HTTP concepts."
  can import  [types, config, repositories]
}

layer middleware {
  path        "src/middleware"
  description "Express middleware. Auth, validation, error handling."
  can import  [types, config, services]
}

layer controllers {
  path        "src/controllers"
  description "HTTP handlers. Delegate to services. Return responses."
  can import  [types, config, services, middleware]
}

layer routes {
  path        "src/routes"
  description "Route definitions only. No logic."
  can import  [types, controllers, middleware]
}

layer app {
  path        "src/app.ts"
  description "Express app setup. Registers routes and middleware."
  can import  [types, config, routes, middleware]
}

rule "no-express-in-services" {
  severity    error
  description "Services must not import Express — they must be framework-agnostic"
  forbid import "express"
  except in   [middleware, controllers, routes, app]
}

rule "no-db-in-controllers" {
  severity    error
  description "Controllers must not access DB — delegate to services"
  forbid import "@/db"
  except in   [repositories]
}

rule "no-prisma-in-services" {
  severity    error
  description "Services must not use Prisma directly — use repositories"
  forbid import "@prisma/client"
  except in   [db, repositories]
}

rule "no-business-logic-in-routes" {
  severity    warning
  description "Routes must only register handlers — no inline logic"
  forbid pattern "async (req, res)"
  in layers   [routes]
}

rule "no-process-env-scatter" {
  severity    error
  description "All env access through src/config"
  forbid pattern "process.env."
  in layers   [repositories, services, controllers, routes]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, services, repositories, controllers]
}

convention repository  "src/repositories/{Resource}Repository.ts"
convention service     "src/services/{Resource}Service.ts"
convention controller  "src/controllers/{Resource}Controller.ts"
convention route       "src/routes/{resource}.routes.ts"
convention middleware  "src/middleware/{name}.middleware.ts"

flow request-lifecycle {
  description "HTTP request travels through route → controller → service → repository → DB"
  steps [
    "request hits Express router"
    "middleware runs (auth, validation)"
    "controller method called"
    "controller calls service method"
    "service applies business logic"
    "service calls repository"
    "repository queries Prisma"
    "result flows back up the chain"
    "controller sends HTTP response"
  ]
}
```

---

### Template 5 — CLI Tool (Node.js + TypeScript)

```arc
arc "cli-tool" {
  version  "1.0.0"
  stack    nodejs + typescript
  language typescript
}

layer types {
  path        "src/types"
  description "All types. No I/O."
  can import  []
}

layer config {
  path        "src/config"
  description "CLI config, default values, env vars."
  can import  [types]
}

layer utils {
  path        "src/utils"
  description "Pure functions. No I/O. No process.exit."
  can import  [types, config]
}

layer core {
  path        "src/core"
  description "Core business logic. Pure. No I/O. Fully testable."
  can import  [types, config, utils]
}

layer io {
  path        "src/io"
  description "File system, network, stdin/stdout. I/O only."
  can import  [types, config, utils]
}

layer commands {
  path        "src/commands"
  description "One file per CLI command. Parses args, delegates to core+io."
  can import  [types, config, utils, core, io]
}

layer bin {
  path        "bin"
  description "Entry point. Parses top-level args, calls commands."
  can import  [types, config, commands]
}

rule "no-io-in-core" {
  severity    error
  description "Core logic must be pure — no file system or network access"
  forbid import "fs"
  except in   [io, bin]
}

rule "no-process-exit-outside-bin" {
  severity    error
  description "Only bin/ may call process.exit — use return values elsewhere"
  forbid pattern "process.exit"
  in layers   [core, utils, commands, io]
}

rule "no-console-in-core" {
  severity    error
  description "Core must not print output — return values, let commands print"
  forbid pattern "console."
  in layers   [core, utils]
}

rule "no-any" {
  severity    error
  description "No TypeScript any"
  forbid pattern ": any"
  in layers   [types, core, utils, commands]
}

convention command  "src/commands/{name}.command.ts"
convention util     "src/utils/{name}.ts"
convention core     "src/core/{name}.ts"
convention io       "src/io/{name}.io.ts"
```

---

### Template 6 — Browser Extension (TypeScript)

```arc
arc "browser-extension" {
  version  "1.0.0"
  stack    chrome-extension + typescript + vite
  language typescript
}

layer types {
  path        "src/types"
  description "Shared types across all extension contexts."
  can import  []
}

layer utils {
  path        "src/utils"
  description "Pure utility functions. No browser APIs."
  can import  [types]
}

layer storage {
  path        "src/storage"
  description "chrome.storage wrapper. Single access point for persistence."
  can import  [types]
}

layer messaging {
  path        "src/messaging"
  description "chrome.runtime message passing. Typed message contracts."
  can import  [types]
}

layer background {
  path        "src/background"
  description "Service worker. Handles events, coordinates messaging."
  can import  [types, utils, storage, messaging]
}

layer content {
  path        "src/content"
  description "Content scripts. DOM access only in this layer."
  can import  [types, utils, messaging]
}

layer popup {
  path        "src/popup"
  description "Popup UI. React or vanilla. No direct DOM of host page."
  can import  [types, utils, storage, messaging]
}

rule "no-dom-in-background" {
  severity    error
  description "Background service worker has no DOM access"
  forbid pattern "document."
  in layers   [background, storage, messaging, utils]
}

rule "no-direct-storage-in-ui" {
  severity    error
  description "Popup must access storage through storage layer only"
  forbid pattern "chrome.storage"
  except in   [storage]
}

rule "no-direct-messaging" {
  severity    error
  description "Use messaging layer for chrome.runtime calls"
  forbid pattern "chrome.runtime.sendMessage"
  except in   [messaging]
}
```

---

## Summary: Arc Feature List

Based on all of the above, here's the complete feature list `arc` should support:

```md
Import analysis      → layer boundaries, forbidden modules, circular deps
Export analysis      → shape per layer (type-only, async-only, etc.)
File analysis        → location, naming, extension correctness
Directive analysis   → 'use server', 'use client'
Pattern analysis     → code smell detection, env leakage, forbidden APIs
Naming enforcement   → filename patterns per layer (enforced not just documented)
Dead code detection  → exported but never imported
Dependency rules     → forbidden packages, dev-only packages
Flow documentation   → non-enforced, used for map + AI context
Convention scaffold  → arc scaffold generates correct files
```
