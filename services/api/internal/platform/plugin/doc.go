// Package plugin provides the WASM plugin runtime infrastructure for the Paca
// API service.  It includes:
//
//   - Store: loads WASM binaries from local disk or S3.
//   - Runtime: manages wazero module instantiation, host function bridges, and
//     plugin lifecycle (Init/HandleRequest/HandleEvent/Shutdown).
//   - MigrationRunner: runs plugin-owned SQL migrations within the plugin's
//     dedicated PostgreSQL schema namespace.
//
// Use [NewStore] to create a store, [NewRuntime] to create a runtime wired to
// the store, and call [Runtime.LoadAll] after loading plugin records from the
// database to instantiate every enabled plugin.
package plugin
