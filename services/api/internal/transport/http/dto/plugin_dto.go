package dto

import (
	"time"

	"github.com/google/uuid"
	plugindom "github.com/paca/api/internal/domain/plugin"
)

// -------------------------------------------------------------------------
// Plugin responses
// -------------------------------------------------------------------------

// PluginResponse is the JSON representation of an installed plugin.
type PluginResponse struct {
	ID          uuid.UUID                `json:"id"`
	Name        string                   `json:"name"`
	Version     string                   `json:"version"`
	Manifest    plugindom.PluginManifest `json:"manifest"`
	Enabled     bool                     `json:"enabled"`
	InstalledAt time.Time                `json:"installed_at"`
	UpdatedAt   time.Time                `json:"updated_at"`
}

// PluginResponseFromEntity maps a domain Plugin to its DTO.
func PluginResponseFromEntity(p *plugindom.Plugin) PluginResponse {
	return PluginResponse{
		ID:          p.ID,
		Name:        p.Name,
		Version:     p.Version,
		Manifest:    p.Manifest,
		Enabled:     p.Enabled,
		InstalledAt: p.InstalledAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

// PluginListResponse is the JSON wrapper for a list of plugins.
type PluginListResponse struct {
	Plugins []PluginResponse `json:"plugins"`
}

// PluginListResponseFromEntities maps a slice of plugins to the list DTO.
func PluginListResponseFromEntities(plugins []*plugindom.Plugin) PluginListResponse {
	items := make([]PluginResponse, len(plugins))
	for i, p := range plugins {
		items[i] = PluginResponseFromEntity(p)
	}
	return PluginListResponse{Plugins: items}
}

// -------------------------------------------------------------------------
// Plugin install request (POST /admin/plugins)
// -------------------------------------------------------------------------

// InstallPluginRequest is the JSON body for installing a plugin.
type InstallPluginRequest struct {
	// Name is the reverse-DNS plugin identifier, e.g. "com.paca.checklist".
	Name string `json:"name" binding:"required"`
	// Version is the semver version string, e.g. "1.0.0".
	Version string `json:"version" binding:"required"`
	// Manifest is the full plugin.json content.
	Manifest plugindom.PluginManifest `json:"manifest" binding:"required"`
	// Enabled controls whether the plugin is active immediately after install.
	Enabled bool `json:"enabled"`
}

// -------------------------------------------------------------------------
// Plugin update request (PATCH /admin/plugins/:pluginId)
// -------------------------------------------------------------------------

// UpdatePluginRequest is the JSON body for patching a plugin.
// All fields are optional; omitted fields leave the existing value unchanged.
type UpdatePluginRequest struct {
	Version  *string                   `json:"version"`
	Manifest *plugindom.PluginManifest `json:"manifest"`
	Enabled  *bool                     `json:"enabled"`
}

// -------------------------------------------------------------------------
// Plugin preference
// -------------------------------------------------------------------------

// PluginExtensionSettingResponse is the JSON shape of a plugin_extension_settings row.
type PluginExtensionSettingResponse struct {
	ID             uuid.UUID                      `json:"id"`
	PluginID       uuid.UUID                      `json:"plugin_id"`
	ExtensionPoint string                         `json:"extension_point"`
	Settings       plugindom.ExtensionSettingData `json:"settings"`
	UpdatedAt      time.Time                      `json:"updated_at"`
}

// PluginExtensionSettingFromEntity maps a domain PluginExtensionSetting to its DTO.
func PluginExtensionSettingFromEntity(s *plugindom.PluginExtensionSetting) PluginExtensionSettingResponse {
	return PluginExtensionSettingResponse{
		ID:             s.ID,
		PluginID:       s.PluginID,
		ExtensionPoint: s.ExtensionPoint,
		Settings:       s.Settings,
		UpdatedAt:      s.UpdatedAt,
	}
}

// UpdatePluginExtensionSettingRequest is the JSON body for
// PATCH /admin/plugin-extension-settings.
type UpdatePluginExtensionSettingRequest struct {
	PluginID       uuid.UUID                      `json:"plugin_id" binding:"required"`
	ExtensionPoint string                         `json:"extension_point" binding:"required"`
	Settings       plugindom.ExtensionSettingData `json:"settings"`
}
