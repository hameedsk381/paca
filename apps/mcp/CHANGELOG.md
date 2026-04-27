# Changelog

All notable changes to the Paca MCP server will be documented in this file.

## [0.1.0] - 2024-04-25

### Added
- Initial release of Paca MCP server
- API key authentication support
- Project management tools (5 tools)
- Task management tools (6 tools)
- Sprint management tools (6 tools)
- Document management tools (5 tools)
- Automatic BlockNote ↔ Markdown conversion
- Modular architecture with clear separation of concerns
- Comprehensive documentation (5 documentation files)

### Changed
- Refactored from monolithic 1,374-line file to modular 13-file structure
- Separated concerns into 6 distinct layers (types, api, tools, utils, server, entry)
- Improved code organization and maintainability
- Enhanced type safety throughout

### Structure
```
src/
├── api/           # HTTP communication
├── tools/         # MCP tool definitions
├── types/         # TypeScript types
├── utils/         # Utility functions
├── server.ts      # MCP server setup
└── index.ts       # Entry point
```

### Documentation
- README.md - User documentation and quick start guide
- DEVELOPMENT.md - Developer guide and contribution guidelines
- IMPLEMENTATION.md - Technical implementation details
- ARCHITECTURE.md - Architecture diagrams and design principles
- REFACTORING_SUMMARY.md - Summary of refactoring changes

### Features
- **23 MCP tools** across 4 domains:
  - Projects: list, get, create, update, delete
  - Tasks: list, get, get-by-number, create, update, delete
  - Sprints: list, get, create, update, delete, complete
  - Documents: list, get, create, update, delete

- **BlockNote Integration**:
  - Automatic conversion from Markdown to BlockNote when writing
  - Automatic conversion from BlockNote to Markdown when reading
  - Supports rich text formatting in task descriptions and document content

- **API Key Authentication**:
  - Secure authentication via `X-API-Key` header
  - Configuration via `PACA_API_KEY` environment variable
  - Compatible with Paca's API key system

### Technical Details
- TypeScript for full type safety
- Node.js stdio transport for MCP protocol
- `@modelcontextprotocol/sdk` for MCP implementation
- `@blocknote/core` for format conversion
- `node-fetch` for HTTP requests
- 1,623 lines of well-organized code
- ~3,800 lines of comprehensive documentation

### Configuration
```bash
PACA_API_KEY="your-api-key-here"        # Required
PACA_API_URL="http://localhost:8080"    # Optional (default: http://localhost:8080)
```

## [Unreleased]

### Planned Features
- Additional API endpoints (attachments, notifications, views, etc.)
- Batch operations
- Filtering and pagination
- Search functionality
- Real-time updates via WebSockets
- Unit and integration tests
