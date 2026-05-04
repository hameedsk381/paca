# Plugin System — Task Breakdown

## Epic 1 — Backend Plugin Infrastructure

- [x] **PLUG-BE-01** Add `plugins` and `plugin_extension_settings` DB tables (new core migration: plugins with id, name, version, manifest JSONB, enabled, installed_at; plugin_extension_settings with plugin_id, extension_point, settings JSONB — system-wide, no user scope)
- [x] **PLUG-BE-02** Implement plugin store loader (read WASM binaries from local disk or S3, controlled by `plugins.store` server config key)
- [x] **PLUG-BE-03** Implement wazero WASM runtime and plugin lifecycle (per-plugin module instantiation, isolated linear memory, export contract: `Init`, `HandleRequest`, `HandleEvent`, `Shutdown`, CPU/memory limits)
- [x] **PLUG-BE-04** Implement host function bridge — DB functions (`paca.db_query`, `paca.db_exec`, `paca.db_tx_begin/commit/rollback`, `paca.storage_get/set/delete`, project-scope isolation enforced on all queries)
- [x] **PLUG-BE-05** Implement host function bridge — Core read-only functions (`paca.tasks_list`, `paca.task_get`, `paca.project_get`, `paca.members_list`, scoped to caller's authorised project)
- [x] **PLUG-BE-06** Implement host function bridge — HTTP functions (`paca.http_respond`, `paca.http_request_body`, `paca.http_request_headers`, `paca.http_caller_identity`)
- [x] **PLUG-BE-07** Implement host function bridge — Event and utility functions (`paca.event_subscribe`, `paca.event_emit`, `paca.log`, `paca.config_get`)
- [x] **PLUG-BE-08** Implement plugin route registration in Gin (parse `backend.routes` from `plugin.json` at startup, mount at `/api/v1/plugins/{pluginId}/projects/:projectId/{path}`, inject auth + project-scope middleware)
- [x] **PLUG-BE-09** Implement plugin-owned migration runner (run new `migrations/*.sql` files within the plugin's schema namespace on install/upgrade, sequential naming `0001_*.sql`)
- [x] **PLUG-BE-10** Implement plugin management API endpoints (`GET /api/v1/plugins`, `POST /api/v1/admin/plugins`, `PATCH /api/v1/admin/plugins/:pluginId`, `DELETE /api/v1/admin/plugins/:pluginId`)
- [x] **PLUG-BE-11** Implement plugin extension setting endpoint (`PATCH /api/v1/admin/plugin-extension-settings` — super admin sets system-wide extension point ordering and visibility; no per-user overrides)

---

## Epic 2 — Frontend Plugin Infrastructure

- [x] **PLUG-FE-01** Set up Module Federation in `apps/web` (add `@originjs/vite-plugin-federation` to `vite.config.ts`, configure host mode, mark `react`, `react-dom`, `@paca/plugin-sdk` as shared singletons)
- [x] **PLUG-FE-02** Implement `PluginRegistryContext` (`apps/web/src/lib/plugins/registry.ts` fetching `GET /api/v1/plugins`, build `Map<ExtensionPointId, Registration[]>`; React context + provider loaded on app mount)
- [x] **PLUG-FE-03** Implement remote component loader (`apps/web/src/lib/plugins/loader.tsx` — `React.lazy` + dynamic Module Federation `import()` keyed by `remoteEntryUrl` + component name, `<ErrorBoundary>` wrapper per remote component)
- [x] **PLUG-FE-04** Implement `<ExtensionPoint>` and `<PluginSlot>` primitives (`apps/web/src/lib/plugins/extension-point.tsx` — reads registry, renders all registrations in order, each in an error boundary; `<PluginSlot>` for single named slots)
- [x] **PLUG-FE-05** Wire extension points into the app shell (`sidebar.general.section` in the general nav area of `app-sidebar.tsx`; `sidebar.project.section` in the project nav section)
- [x] **PLUG-FE-06** Wire extension points into task detail (`task.detail.section` in `task-detail/index.tsx`, rendered after existing core sections)
- [x] **PLUG-FE-07** Wire extension points into project settings (`project.settings.tab` rendered as additional tabs on the project settings page)
- [x] **PLUG-FE-08** Wire extension point for custom views (`view` extension point in the view selector/board area; registered views appear in the view picker)
- [x] **PLUG-FE-09** Implement plugin panel drag-to-reorder and visibility toggle for super admins (order and visibility persisted via `PATCH /api/v1/admin/plugin-extension-settings`, applied system-wide for all users on load; `PluginPreferencesPanel` is accessible only to super admins)

---

## Epic 3 — Plugin SDK

- [ ] **PLUG-SDK-01** Create `plugins/sdk/frontend/` TypeScript package `@paca/plugin-sdk` (`PluginApiClient`, `PluginUI` with `toast/confirm/navigate`, `PluginMeta`, all extension point prop interfaces, shared types `TaskSummary`/`ProjectPermissions`/`TaskFilters`, `PluginQueryClientProvider` + `usePluginQuery`)
- [ ] **PLUG-SDK-02** Create `plugins/sdk/backend/` Go package `github.com/paca/plugin-sdk` (`Plugin` interface, `plugin.Run()` dispatcher, `Context` with route/event registration, `RouteHandler` with `Request`/`Response`/`CallerIdentity`, `EventHandler`, `DB` typed query builder, `KV` store, `Logger`, `plugin.JSONBody()` helper)
- [ ] **PLUG-SDK-03** Create `plugintest` package for Go unit testing (`plugintest.NewContext()`, `plugintest.Request`, `plugintest.NewResponse()`, in-memory DB seed helpers)

---

## Epic 4 — Plugin: Checklist (`com.paca.checklist`)

- [ ] **PLUG-CL-01** Write `com.paca.checklist` backend WASM plugin (`plugins/first-party/checklist/backend/` — CRUD routes for checklists and checklist items, `task.deleted` event handler for cascade delete, migration `0001_create_task_checklists.sql`)
- [ ] **PLUG-CL-02** Write `com.paca.checklist` frontend micro-frontend (`plugins/first-party/checklist/frontend/` — extract `checklist-section.tsx` and `checklists-section.tsx`, use `sdk.api` for all HTTP calls)
- [ ] **PLUG-CL-03** Migrate checklist tables out of core (new core DB migration moving `task_checklists` and `task_checklist_items` into `plugin_data_com_paca_checklist` schema; remove checklist entity, service methods, repository, handler methods, DTOs, and router routes from core)
- [ ] **PLUG-CL-04** Replace `<ChecklistsSection>` with `<ExtensionPoint>` in `task-detail/index.tsx`
- [ ] **PLUG-CL-05** Update e2e tests for checklist plugin paths (update API paths in page objects and spec files, ensure checklist plugin is seeded as enabled in `seed.spec.ts`)

---

## Epic 5 — Plugin: BDD Scenarios (`com.paca.bdd`)

- [ ] **PLUG-BDD-01** Write `com.paca.bdd` backend WASM plugin (`plugins/first-party/bdd/backend/` — routes `LIST|CREATE|GET|UPDATE|DELETE /tasks/:taskId/bdd-scenarios`, `task.deleted` event handler, migration `0001_create_bdd_scenarios.sql`)
- [ ] **PLUG-BDD-02** Write `com.paca.bdd` frontend micro-frontend (`plugins/first-party/bdd/frontend/` — extract `bdd-scenarios-section.tsx`, optional `ProjectSettingsTab` for BDD templates)
- [ ] **PLUG-BDD-03** Migrate `bdd_scenarios` table out of core (new core DB migration moving `bdd_scenarios` into `plugin_data_com_paca_bdd` schema; remove `BDDScenario` entity, service methods, repository, handler methods `ListBDDScenarios`/`CreateBDDScenario`/`GetBDDScenario`/`UpdateBDDScenario`/`DeleteBDDScenario`, DTOs, and routes from core)
- [ ] **PLUG-BDD-04** Replace `<BDDScenariosSection>` with `<ExtensionPoint>` in `task-detail/index.tsx`
- [ ] **PLUG-BDD-05** Update MCP server BDD tool paths (`apps/mcp` — update BDD tool API calls from `/projects/.../bdd-scenarios` to `/plugins/com.paca.bdd/projects/.../bdd-scenarios`)
- [ ] **PLUG-BDD-06** Update e2e tests for BDD plugin paths

---

## Epic 6 — Plugin: Time Tracking (`com.paca.time-tracking`)

- [ ] **PLUG-TT-01** Write `com.paca.time-tracking` backend WASM plugin (`plugins/first-party/time-tracking/backend/` — migration creating `time_entries` table, routes `LIST|CREATE|PATCH|DELETE /tasks/:taskId/time-entries` and `GET /time-report`, permission guard: members edit own entries, admins manage all)
- [ ] **PLUG-TT-02** Write `com.paca.time-tracking` task detail section frontend (panel in task detail showing log entries list and "Add Entry" form)
- [ ] **PLUG-TT-03** Write `com.paca.time-tracking` project settings tab frontend (project-wide time log report with filter by member + date range, exportable)
- [ ] **PLUG-TT-04** Write `com.paca.time-tracking` project sidebar section frontend ("Time Log" navigation link in the project sidebar)

---

## Epic 7 — Plugin: GitHub Integration (`com.paca.github`)

- [ ] **PLUG-GH-01** Add `paca.http_fetch` host function (allowlisted outbound domains only, configured in server config — required for GitHub REST API calls from WASM)
- [ ] **PLUG-GH-02** Add `paca.secrets_encrypt` / `paca.secrets_decrypt` host functions (wrap existing AES-256-GCM encryption used by current GitHub domain)
- [ ] **PLUG-GH-03** Implement webhook forwarder in core (keep `POST /webhooks/github` in core — validate HMAC, then emit `com.paca.github.webhook` event to plugin runtime via the event bus)
- [ ] **PLUG-GH-04** Write `com.paca.github` backend WASM plugin (`plugins/first-party/github/backend/` — routes for integration CRUD, repository link/unlink, PR list, task↔PR link/unlink; `com.paca.github.webhook` event handler for syncing PRs; migration `0001_create_github_tables.sql`)
- [ ] **PLUG-GH-05** Write `com.paca.github` project settings tab frontend (extract `GitHubSettings.tsx` into the plugin)
- [ ] **PLUG-GH-06** Write `com.paca.github` task detail sections frontend (extract `branches-section.tsx` and `pull-requests-section.tsx` into the plugin)
- [ ] **PLUG-GH-07** Write `com.paca.github` project sidebar section frontend (optional "Open PRs" quick link in the project sidebar)
- [ ] **PLUG-GH-08** Migrate GitHub tables out of core (new core DB migration moving `github_integrations`, `github_repositories`, `github_pull_requests`, `github_task_pr_links` into `plugin_data_com_paca_github` schema; remove `internal/domain/github/`, `github_handler.go`, and all GitHub router routes from core)
- [ ] **PLUG-GH-09** Update MCP server GitHub tool paths
- [ ] **PLUG-GH-10** Update e2e tests for GitHub plugin paths

---

## Epic 8 — SDK Publication & Developer Experience

- [ ] **PLUG-DX-01** Publish `@paca/plugin-sdk` to npm (or internal registry)
- [ ] **PLUG-DX-02** Publish `github.com/paca/plugin-sdk` to pkg.go.dev
- [ ] **PLUG-DX-03** Add `plugins/` directory to repo with SDK packages, first-party plugin directories, and docs index
- [ ] **PLUG-DX-04** Add Vite Module Federation dev server configuration for local plugin development (hot reload for frontend plugin components without restarting the host app)
