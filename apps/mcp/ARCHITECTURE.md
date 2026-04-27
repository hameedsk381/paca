# Architecture Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Client                              │
│                    (Claude, etc.)                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ stdio
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       index.ts (Entry)                          │
│  - Load configuration (PACA_API_KEY, PACA_API_URL)             │
│  - Initialize PacaAPIClient                                     │
│  - Create MCP Server                                            │
│  - Connect to stdio transport                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        server.ts                                │
│  - Create Server instance                                      │
│  - Register ListToolsRequestSchema handler                     │
│  - Register CallToolRequestSchema handler                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Tool Call
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    tools/index.ts (Router)                      │
│  - getAllTools(): Returns all tool definitions                  │
│  - handleToolCall(): Routes to appropriate handler              │
└───────────┬───────────┬───────────┬───────────┬────────────────┘
            │           │           │           │
            │           │           │           │
            ▼           ▼           ▼           ▼
    ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
    │  project- │ │  task-   │ │ sprint-  │ │  document-   │
    │  tools.ts │ │ tools.ts │ │ tools.ts │ │  tools.ts    │
    └─────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
          │            │            │              │
          │            │            │              │
          └────────────┴────────────┴──────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  api/client.ts  │
                  │  PacaAPIClient  │
                  └────────┬────────┘
                           │
                           │ HTTP + X-API-Key
                           ▼
                  ┌─────────────────┐
                  │   Paca API      │
                  └─────────────────┘
```

## Layer Responsibilities

### Entry Layer (`index.ts`)
- **Purpose**: Application bootstrap
- **Responsibilities**:
  - Load environment variables
  - Validate configuration
  - Create API client
  - Initialize server
  - Handle startup errors

### Server Layer (`server.ts`)
- **Purpose**: MCP protocol implementation
- **Responsibilities**:
  - Create MCP Server instance
  - Define capabilities
  - Register request handlers
  - Connect to transport

### Tools Layer (`tools/`)
- **Purpose**: Business logic and tool definitions
- **Responsibilities**:
  - Define tool schemas
  - Implement tool handlers
  - Route requests
  - Format responses

### API Layer (`api/`)
- **Purpose**: HTTP communication
- **Responsibilities**:
  - Make HTTP requests
  - Handle authentication
  - Convert formats
  - Return typed responses

### Utils Layer (`utils/`)
- **Purpose**: Reusable utilities
- **Responsibilities**:
  - Format conversion (BlockNote ↔ Markdown)
  - Output formatting
  - Helper functions

### Types Layer (`types/`)
- **Purpose**: Type definitions
- **Responsibilities**:
  - Define interfaces
  - Define input/output types
  - Shared across modules

## Data Flow

### Tool Call Flow

```
1. MCP Client sends tool call
   ↓
2. stdio transport receives message
   ↓
3. server.ts routes to handleToolCall
   ↓
4. tools/index.ts routes to domain handler
   ↓
5. Domain handler calls API client
   ↓
6. API client makes HTTP request
   ↓
7. API client receives response
   ↓
8. API client converts format (if needed)
   ↓
9. Domain handler formats output
   ↓
10. tools/index.ts returns response
   ↓
11. server.ts sends response
   ↓
12. stdio transport sends to MCP Client
```

### Format Conversion Flow

#### Reading Data (BlockNote → Markdown)

```
API Response (BlockNote JSON)
    ↓
api/client.ts receives
    ↓
utils/converters.ts.blocknoteToMarkdown()
    ↓
utils/formatters.ts.format*()
    ↓
Markdown text returned to MCP Client
```

#### Writing Data (Markdown → BlockNote)

```
MCP Client sends Markdown
    ↓
tools handler receives
    ↓
utils/converters.ts.markdownToBlocknote()
    ↓
api/client.ts sends BlockNote JSON
    ↓
API stores BlockNote JSON
```

## Module Dependencies

```
index.ts
  └── server.ts
        └── tools/index.ts
              ├── tools/project-tools.ts
              ├── tools/task-tools.ts
              ├── tools/sprint-tools.ts
              ├── tools/document-tools.ts
              ├── api/client.ts
              └── utils/index.ts
                    ├── utils/converters.ts
                    └── utils/formatters.ts

api/client.ts
  └── types/index.ts

tools/*.ts
  ├── types/index.ts
  └── utils/index.ts

utils/*.ts
  └── types/index.ts

types/index.ts
  (no dependencies)
```

## Key Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Dependency Inversion**: Higher layers depend on abstractions
3. **Open/Closed**: Easy to extend, closed to modification
4. **Type Safety**: Full TypeScript coverage
5. **Separation of Concerns**: Clear boundaries between layers
6. **Testability**: Each module can be tested independently

## Extension Points

### Adding a New Domain

1. Define types in `types/index.ts`
2. Add API methods to `api/client.ts`
3. Create `tools/new-domain-tools.ts`
4. Update `tools/index.ts` to register new tools
5. Add formatters to `utils/formatters.ts` (if needed)

### Adding a New Tool to Existing Domain

1. Add tool definition to `tools/[domain]-tools.ts`
2. Add handler to existing switch statement
3. Add API method to `api/client.ts` (if needed)
4. Update routing in `tools/index.ts` (if new prefix)

### Changing Format Conversion

1. Modify `utils/converters.ts`
2. No changes needed in other layers (encapsulation)

### Changing Output Format

1. Modify formatters in `utils/formatters.ts`
2. No changes needed in business logic (separation of concerns)
