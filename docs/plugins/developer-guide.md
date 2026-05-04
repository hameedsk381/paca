# Plugin Developer Guide

This guide walks you through building a complete Paca plugin from scratch. By the end you will have a working plugin with a backend WASM module, a frontend micro-frontend component, and a published manifest.

## Prerequisites

- Go 1.21+ with TinyGo 0.32+ for WASM compilation.
- Node.js 20+ and pnpm 9+ for the frontend.
- A running local Paca instance (see [local-development.md](../guides/local-development.md)).

---

## Plugin Repository Layout

You may develop your plugin in its own repository or as a directory inside the Paca monorepo's `plugins/` folder.

```
my-plugin/
  plugin.json              ← manifest
  backend/
    go.mod
    go.sum
    main.go                ← WASM entry point
    handler.go             ← route/event handlers
    migrations/
      0001_create_my_table.sql
  frontend/
    package.json
    vite.config.ts
    tsconfig.json
    src/
      TaskDetailSection.tsx  ← extension point components
      index.ts               ← re-exports
  dist/                    ← build output (gitignored)
    my-plugin.wasm
    remoteEntry.js
    plugin.json            ← copied from root, versions resolved
```

---

## Step 1 — Write the Manifest

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "A short description of what this plugin does.",
  "author": "Your Name <you@example.com>",
  "license": "MIT",
  "minCoreVersion": "0.5.0",

  "frontend": {
    "remoteEntryUrl": "https://cdn.example.com/my-plugin/0.1.0/remoteEntry.js",
    "extensionPoints": [
      {
        "point": "task.detail.section",
        "component": "TaskDetailSection",
        "label": "My Feature",
        "order": 50
      }
    ]
  },

  "backend": {
    "wasm": "my-plugin.wasm",
    "permissions": [
      "db:read:tasks",
      "db:write:plugin_data",
      "http:register_routes"
    ],
    "routes": [
      { "method": "GET",  "path": "/tasks/:taskId/my-items" },
      { "method": "POST", "path": "/tasks/:taskId/my-items" }
    ],
    "migrations": [
      "0001_create_my_items.sql"
    ]
  }
}
```

**Choosing an `id`:** Use reverse-domain notation: `com.yourcompany.feature-name`. First-party plugins use `com.paca.*`. The ID becomes part of the API path (`/api/v1/plugins/{id}/...`) and the database schema name, so it must be stable after first release.

---

## Step 2 — Write the Backend

### `backend/go.mod`

```
module github.com/example/my-plugin

go 1.21

require github.com/paca/plugin-sdk v0.1.0
```

### `backend/main.go`

```go
package main

import "github.com/paca/plugin-sdk/plugin"

type MyPlugin struct{}

func (p MyPlugin) OnInit(ctx plugin.Context) error {
    ctx.GET("/tasks/:taskId/my-items", listItems)
    ctx.POST("/tasks/:taskId/my-items", createItem)
    return nil
}

func (p MyPlugin) OnShutdown() error { return nil }

//export Init
func Init() { plugin.Run(MyPlugin{}) }

//export HandleRequest
func HandleRequest(routeID int32) { plugin.DispatchRequest(routeID) }

//export HandleEvent
func HandleEvent(eventID int32) { plugin.DispatchEvent(eventID) }

//export Shutdown
func Shutdown() { plugin.Shutdown() }

func main() {}
```

### `backend/handler.go`

```go
package main

import (
    "github.com/paca/plugin-sdk/plugin"
)

type MyItem struct {
    ID     string `json:"id"`
    TaskID string `json:"task_id"`
    Title  string `json:"title"`
}

func listItems(req *plugin.Request, resp *plugin.Response) {
    taskID := req.PathParams["taskId"]
    rows, err := plugin.DB().Query(plugin.SelectQuery{
        Table: "my_items",
        Where: map[string]any{"task_id": taskID},
    })
    if err != nil {
        resp.Error(500, "internal_error", err.Error())
        return
    }

    var items []MyItem
    if err := rows.Scan(&items); err != nil {
        resp.Error(500, "scan_error", err.Error())
        return
    }
    resp.JSON(200, items)
}

func createItem(req *plugin.Request, resp *plugin.Response) {
    var body struct {
        Title string `json:"title"`
    }
    if err := plugin.JSONBody(req, &body); err != nil || body.Title == "" {
        resp.Error(400, "bad_request", "title is required")
        return
    }

    result, err := plugin.DB().Exec(plugin.ExecQuery{
        Table: "my_items",
        Op:    plugin.Insert,
        Data: map[string]any{
            "task_id": req.PathParams["taskId"],
            "title":   body.Title,
        },
    })
    if err != nil {
        resp.Error(500, "create_failed", err.Error())
        return
    }
    resp.JSON(201, result.Row)
}
```

### `backend/migrations/0001_create_my_items.sql`

```sql
CREATE TABLE my_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL,
    project_id UUID NOT NULL,
    title      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON my_items (task_id);
```

### Building the WASM Binary

```sh
cd backend
GOOS=wasip1 GOARCH=wasm tinygo build -o ../dist/my-plugin.wasm -target wasip1 .
```

Or with standard Go (larger binary):
```sh
GOOS=wasip1 GOARCH=wasm go build -o ../dist/my-plugin.wasm .
```

---

## Step 3 — Write the Frontend

### `frontend/package.json`

```json
{
  "name": "my-plugin",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@paca/plugin-sdk": "^0.1.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@originjs/vite-plugin-federation": "^1.3.5",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

### `frontend/vite.config.ts`

```ts
import federation from "@originjs/vite-plugin-federation";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "com_example_my_plugin",
      filename: "remoteEntry.js",
      exposes: {
        "./TaskDetailSection": "./src/TaskDetailSection.tsx",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.3.0" },
        "react-dom": { singleton: true, requiredVersion: "^18.3.0" },
        "@paca/plugin-sdk": { singleton: true },
      },
    }),
  ],
  build: {
    target: "esnext",
    outDir: "../dist",
    emptyOutDir: false,
  },
});
```

### `frontend/src/TaskDetailSection.tsx`

```tsx
import type { TaskDetailSectionProps } from "@paca/plugin-sdk";
import {
  PluginQueryClientProvider,
  usePluginQuery,
} from "@paca/plugin-sdk";

export default function TaskDetailSection(props: TaskDetailSectionProps) {
  return (
    <PluginQueryClientProvider sdk={props.sdk}>
      <MyFeaturePanel {...props} />
    </PluginQueryClientProvider>
  );
}

function MyFeaturePanel({ sdk, taskId }: TaskDetailSectionProps) {
  const { data: items = [], isLoading } = usePluginQuery({
    queryKey: ["my-items", taskId],
    queryFn: () => sdk.api.get<MyItem[]>(`tasks/${taskId}/my-items`),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <section>
      <h3>My Feature</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </section>
  );
}

interface MyItem {
  id: string;
  taskId: string;
  title: string;
}
```

### Building the Frontend

```sh
cd frontend
pnpm install
pnpm build
```

Output goes to `dist/remoteEntry.js` (and associated chunks).

---

## Step 4 — Install the Plugin Locally

1. Copy the plugin bundle into your local Paca plugin store path:

```sh
mkdir -p /path/to/paca/plugins/dist/com.example.my-plugin
cp dist/my-plugin.wasm dist/remoteEntry.js plugin.json \
   /path/to/paca/plugins/dist/com.example.my-plugin/
```

2. Insert the plugin record into the database (development shortcut; production uses an API):

```sql
INSERT INTO plugins (id, name, version, manifest, enabled)
VALUES (
  gen_random_uuid(),
  'com.example.my-plugin',
  '0.1.0',
  '{"id":"com.example.my-plugin",...}',
  true
);
```

3. Restart `services/api`. On startup the host will:
   - Load `my-plugin.wasm` into wazero.
   - Run `0001_create_my_items.sql` if not already applied.
   - Register the plugin's HTTP routes.
   - Return the plugin in `GET /api/v1/plugins`.

4. The frontend will pick up the new plugin on next page load.

---

## Step 5 — Test Your Plugin

### Backend Routes

```sh
curl -s -b "session=..." \
  http://localhost:8080/api/v1/plugins/com.example.my-plugin/projects/{pid}/tasks/{tid}/my-items \
  | jq .
```

### Frontend

Open a task detail panel — your `TaskDetailSection` component should appear.

### Unit Testing the Backend

Use standard Go testing with a mock host context from the SDK's `plugintest` package:

```go
package main_test

import (
    "testing"
    "github.com/paca/plugin-sdk/plugintest"
)

func TestListItems(t *testing.T) {
    ctx := plugintest.NewContext()
    ctx.DB().Seed("my_items", []map[string]any{
        {"id": "abc", "task_id": "task-1", "title": "Test item"},
    })

    req := plugintest.Request{PathParams: map[string]string{"taskId": "task-1"}}
    resp := plugintest.NewResponse()
    listItems(&req, resp)

    if resp.StatusCode != 200 { t.Fatalf("got %d", resp.StatusCode) }
}
```

---

## Versioning and Updates

- Follow semver. Increment the **patch** version for bug fixes, **minor** for new extension points, **major** for breaking changes to your API.
- Database migrations are **additive only**. Never drop or rename columns in a migration; use a new migration file.
- When you release a new version, update `plugin.json` and re-upload the bundle. The host will detect the version change on next startup and run new migrations.

---

## Publishing Checklist

Before sharing your plugin:

- [ ] Plugin ID follows reverse-domain notation.
- [ ] `minCoreVersion` is set to the minimum Paca version you tested against.
- [ ] All DB tables are within your plugin's schema.
- [ ] No secrets or credentials are hard-coded in the WASM binary or JS bundle.
- [ ] The WASM binary is signed with your private key (include the public key in `plugin.json` under `publisher.publicKey`).
- [ ] The `remoteEntryUrl` points to an HTTPS CDN, not `localhost`.
- [ ] A `README.md` explains what the plugin does and how to configure it.
- [ ] E2E or integration tests cover the main scenarios.
