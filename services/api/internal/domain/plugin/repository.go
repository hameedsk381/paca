package plugindom

import (
	"context"

	"github.com/google/uuid"
)

// Repository is the combined persistence contract for the plugin aggregate.
type Repository interface {
	PluginRepository
	PluginExtensionSettingRepository
}

// PluginRepository manages the plugin registry.
type PluginRepository interface {
	// List returns all registered plugins, ordered by name.
	List(ctx context.Context) ([]*Plugin, error)

	// FindByID returns the plugin with the given ID.
	// Returns ErrNotFound when the plugin does not exist.
	FindByID(ctx context.Context, id uuid.UUID) (*Plugin, error)

	// FindByName returns the plugin with the given reverse-DNS name.
	// Returns ErrNotFound when the plugin does not exist.
	FindByName(ctx context.Context, name string) (*Plugin, error)

	// Create inserts a new plugin into the registry.
	// Returns ErrNameTaken when a plugin with the same name already exists.
	Create(ctx context.Context, plugin *Plugin) error

	// Update replaces the mutable fields of an existing plugin (version,
	// manifest, enabled).  Returns ErrNotFound when the plugin does not exist.
	Update(ctx context.Context, plugin *Plugin) error

	// Delete removes a plugin and all associated extension settings.
	// Returns ErrNotFound when the plugin does not exist.
	Delete(ctx context.Context, id uuid.UUID) error
}

// PluginExtensionSettingRepository manages system-wide extension-point settings.
type PluginExtensionSettingRepository interface {
	// ListSettings returns all extension settings for the given plugin.
	ListSettings(ctx context.Context, pluginID uuid.UUID) ([]*PluginExtensionSetting, error)

	// ListSettingsForPlugins returns all extension settings for the given plugin IDs.
	ListSettingsForPlugins(ctx context.Context, pluginIDs []uuid.UUID) ([]*PluginExtensionSetting, error)

	// UpsertSetting creates or replaces the settings row for the given
	// (plugin, extension_point) key.
	UpsertSetting(ctx context.Context, setting *PluginExtensionSetting) error
}
