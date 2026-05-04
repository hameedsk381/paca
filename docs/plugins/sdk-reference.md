# Plugin SDK Reference

The Paca Plugin SDK consists of two packages:

- **`@paca/plugin-sdk`** — TypeScript/React SDK for frontend plugin components.
- **`github.com/paca/plugin-sdk`** — Go SDK for backend WASM plugins.

Both packages are maintained in `plugins/sdk/` within the monorepo.

---

## TypeScript SDK (`@paca/plugin-sdk`)

### Installation

```sh
pnpm add @paca/plugin-sdk
```

The package is also declared as a `shared` dependency in Module Federation config so the host's singleton instance is used (see [Frontend Plugin System](frontend-plugin-system.md)).

---

### `PluginSDK`

The main SDK object passed to every plugin component via its context prop.

```ts
interface PluginSDK {
  /** HTTP client scoped to /api/v1/plugins/{pluginId}/projects/{projectId}/ */
  api: PluginApiClient;

  /** UI utilities */
  ui: PluginUI;

  /** Metadata about this plugin and the host */
  meta: PluginMeta;
}
```

---

### `PluginApiClient`

A thin wrapper around `fetch` that:
- Prefixes all requests with `/api/v1/plugins/{pluginId}/projects/{projectId}/`.
- Sends cookies for authentication (`credentials: "include"`).
- Throws typed `PluginApiError` on non-2xx responses.

```ts
interface PluginApiClient {
  get<T>(path: string, options?: RequestInit): Promise<T>;
  post<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  put<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  patch<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  delete<T>(path: string, options?: RequestInit): Promise<T>;
}

class PluginApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
}
```

**Example:**
```ts
const scenarios = await sdk.api.get<BDDScenario[]>(`tasks/${taskId}/bdd-scenarios`);
```

---

### `PluginUI`

Utilities for showing UI feedback without depending on host internals.

```ts
interface PluginUI {
  /** Show a toast notification */
  toast(options: ToastOptions): void;

  /** Show a confirmation dialog; resolves true if confirmed */
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;

  /** Navigate to a Paca route (uses host router) */
  navigate(to: string): void;
}

interface ToastOptions {
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
  duration?: number;
}

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}
```

---

### `PluginMeta`

```ts
interface PluginMeta {
  pluginId: string;      // e.g. "com.paca.bdd"
  pluginVersion: string;
  coreVersion: string;
  projectId: string;     // current project scope
  userId: string;        // authenticated user ID
}
```

---

### Extension Point Component Contracts

Each extension point has a typed React component interface. Your exported component **must** match the prop signature for its extension point.

#### `task.detail.section`

```ts
import type { TaskDetailSectionProps } from "@paca/plugin-sdk";

export default function MyTaskDetailSection(props: TaskDetailSectionProps) { ... }

interface TaskDetailSectionProps {
  taskId: string;
  projectId: string;
  task: TaskSummary;
  permissions: ProjectPermissions;
  sdk: PluginSDK;
}
```

#### `sidebar.general.section`

```ts
import type { GeneralSidebarSectionProps } from "@paca/plugin-sdk";

export default function MyGeneralSection(props: GeneralSidebarSectionProps) { ... }

interface GeneralSidebarSectionProps {
  sdk: PluginSDK;
}
```

#### `sidebar.project.section`

```ts
import type { ProjectSidebarSectionProps } from "@paca/plugin-sdk";

export default function MyProjectSection(props: ProjectSidebarSectionProps) { ... }

interface ProjectSidebarSectionProps {
  projectId: string;
  permissions: ProjectPermissions;
  sdk: PluginSDK;
}
```

#### `project.settings.tab`

```ts
import type { ProjectSettingsTabProps } from "@paca/plugin-sdk";

export default function MySettingsTab(props: ProjectSettingsTabProps) { ... }

interface ProjectSettingsTabProps {
  projectId: string;
  permissions: ProjectPermissions;
  sdk: PluginSDK;
}
```

#### `view`

```ts
import type { ViewProps } from "@paca/plugin-sdk";

export default function MyView(props: ViewProps) { ... }

interface ViewProps {
  projectId: string;
  viewId: string;
  filters: TaskFilters;
  permissions: ProjectPermissions;
  sdk: PluginSDK;
}
```

---

### Shared Types

```ts
interface TaskSummary {
  id: string;
  taskNumber: number;
  title: string;
  statusId: string | null;
  taskTypeId: string | null;
  assigneeId: string | null;
  sprintId: string | null;
  dueDate: string | null;  // ISO 8601
  tags: string[];
}

interface ProjectPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
  isAdmin: boolean;
}

interface TaskFilters {
  statusIds?: string[];
  assigneeIds?: string[];
  taskTypeIds?: string[];
  sprintId?: string;
  search?: string;
}
```

---

### React Query Integration

Plugins may use TanStack Query locally. The SDK exports a pre-configured `QueryClient` scoped to the plugin (keyed under the plugin ID) so plugin queries don't pollute the host's cache:

```ts
import { PluginQueryClientProvider, usePluginQuery } from "@paca/plugin-sdk";

// Wrap your root component
export default function Root(props: TaskDetailSectionProps) {
  return (
    <PluginQueryClientProvider sdk={props.sdk}>
      <MyComponent {...props} />
    </PluginQueryClientProvider>
  );
}

// Use inside the provider
function MyComponent({ sdk, taskId }: TaskDetailSectionProps) {
  const { data } = usePluginQuery({
    queryKey: ["bdd-scenarios", taskId],
    queryFn: () => sdk.api.get(`tasks/${taskId}/bdd-scenarios`),
  });
}
```

---

## Go SDK (`github.com/paca/plugin-sdk`)

### Installation

```sh
go get github.com/paca/plugin-sdk
```

Build target must be `GOARCH=wasm GOOS=wasip1` (using TinyGo for smaller binaries, or standard Go 1.21+ WASI preview 1 support).

---

### Entry Points

Every plugin must export three functions for the host to call:

```go
package main

import "github.com/paca/plugin-sdk/plugin"

func main() {} // required for WASM

//export Init
func Init() {
    plugin.Run(MyPlugin{})
}

//export HandleRequest
func HandleRequest(routeID int32) {
    plugin.DispatchRequest(routeID)
}

//export HandleEvent
func HandleEvent(eventID int32) {
    plugin.DispatchEvent(eventID)
}

//export Shutdown
func Shutdown() {
    plugin.Shutdown()
}
```

---

### `plugin.Plugin` Interface

```go
type Plugin interface {
    // OnInit is called once when the plugin is loaded.
    // Register routes and event handlers here.
    OnInit(ctx Context) error

    // OnShutdown is called before the plugin is unloaded.
    OnShutdown() error
}
```

---

### `plugin.Context`

Passed to `OnInit`. Provides registration methods and access to host services.

```go
type Context interface {
    // Route registration
    GET(path string, handler RouteHandler)
    POST(path string, handler RouteHandler)
    PUT(path string, handler RouteHandler)
    PATCH(path string, handler RouteHandler)
    DELETE(path string, handler RouteHandler)

    // Event subscription (declared routes must match plugin.json)
    On(event string, handler EventHandler)

    // Services (available after OnInit in handlers)
    DB() DB
    KV() KV
    Log() Logger
}
```

---

### `plugin.RouteHandler`

```go
type RouteHandler func(req *Request, resp *Response)

type Request struct {
    Method      string
    Path        string
    PathParams  map[string]string
    QueryParams map[string][]string
    Headers     map[string]string
    Body        []byte
    Caller      CallerIdentity
}

type CallerIdentity struct {
    UserID    string
    ProjectID string
    RoleID    string
    IsAdmin   bool
}

type Response struct {
    // Set these fields then call resp.Send()
    StatusCode int
    Headers    map[string]string
    Body       any // marshalled to JSON
}

func (r *Response) JSON(status int, body any)
func (r *Response) Error(status int, code, message string)
func (r *Response) NoContent()
```

---

### `plugin.EventHandler`

```go
type EventHandler func(event Event)

type Event struct {
    Type      string          // e.g. "task.deleted"
    ProjectID string
    Payload   json.RawMessage // event-specific payload
    OccurredAt time.Time
}
```

---

### `plugin.DB`

Typed query builder — no raw SQL.

```go
type DB interface {
    // Plugin-owned table operations
    Exec(query ExecQuery) (Result, error)
    Query(query SelectQuery) (Rows, error)

    // Core read-only queries (scoped to Caller.ProjectID)
    Tasks() TaskQuery
    Members() MemberQuery
    Project() ProjectQuery

    // Transactions
    WithTx(fn func(DB) error) error
}

// ExecQuery for plugin_data tables
type ExecQuery struct {
    Table  string            // must be within the plugin's schema
    Op     ExecOp            // Insert, Update, Delete
    Data   map[string]any
    Where  map[string]any
}

// SelectQuery for plugin_data tables
type SelectQuery struct {
    Table   string
    Where   map[string]any
    OrderBy string
    Limit   int
    Offset  int
}

type TaskQuery interface {
    Where(filters TaskFilters) TaskQuery
    OrderBy(field, dir string) TaskQuery
    Limit(n int) TaskQuery
    Offset(n int) TaskQuery
    List() ([]Task, error)
    Get(id string) (*Task, error)
}
```

---

### `plugin.KV`

Simple key-value store backed by a per-plugin PostgreSQL JSONB column.

```go
type KV interface {
    Get(key string, dest any) error      // JSON-unmarshals into dest
    Set(key string, value any) error     // JSON-marshals value
    Delete(key string) error
}
```

---

### `plugin.Logger`

```go
type Logger interface {
    Debug(msg string, fields ...Field)
    Info(msg string, fields ...Field)
    Warn(msg string, fields ...Field)
    Error(msg string, fields ...Field)
}

func String(key, val string) Field
func Int(key string, val int) Field
func Err(err error) Field
```

---

### Full Plugin Example (Go)

```go
package main

import (
    "encoding/json"
    "github.com/paca/plugin-sdk/plugin"
)

type BDDPlugin struct{}

func (p BDDPlugin) OnInit(ctx plugin.Context) error {
    ctx.GET("/tasks/:taskId/bdd-scenarios", listScenarios)
    ctx.POST("/tasks/:taskId/bdd-scenarios", createScenario)
    ctx.DELETE("/tasks/:taskId/bdd-scenarios/:scenarioId", deleteScenario)

    ctx.On("task.deleted", onTaskDeleted)
    return nil
}

func (p BDDPlugin) OnShutdown() error { return nil }

func listScenarios(req *plugin.Request, resp *plugin.Response) {
    taskID := req.PathParams["taskId"]
    rows, err := plugin.DB().Query(plugin.SelectQuery{
        Table: "bdd_scenarios",
        Where: map[string]any{"task_id": taskID},
    })
    if err != nil {
        resp.Error(500, "internal_error", err.Error())
        return
    }
    resp.JSON(200, rows.All())
}

func onTaskDeleted(event plugin.Event) {
    var payload struct{ TaskID string `json:"task_id"` }
    json.Unmarshal(event.Payload, &payload)
    plugin.DB().Exec(plugin.ExecQuery{
        Table: "bdd_scenarios",
        Op:    plugin.Delete,
        Where: map[string]any{"task_id": payload.TaskID},
    })
}

//export Init
func Init() { plugin.Run(BDDPlugin{}) }

//export HandleRequest
func HandleRequest(routeID int32) { plugin.DispatchRequest(routeID) }

//export HandleEvent
func HandleEvent(eventID int32) { plugin.DispatchEvent(eventID) }

//export Shutdown
func Shutdown() { plugin.Shutdown() }

func main() {}
```
