package plugindom

import "errors"

// Sentinel errors returned by plugin repositories and services.
var (
	// ErrNotFound is returned when a plugin is not in the registry.
	ErrNotFound = errors.New("plugin not found")

	// ErrNameTaken is returned when a plugin with the same name already exists.
	ErrNameTaken = errors.New("plugin name already exists")

	// ErrPreferenceNotFound is returned when a user_plugin_preference row does
	// not exist for the given (user, plugin, extension_point) combination.
	ErrPreferenceNotFound = errors.New("plugin preference not found")
)
