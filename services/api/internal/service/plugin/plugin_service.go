// Package pluginsvc implements the plugin domain service.
package pluginsvc

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	plugindom "github.com/paca/api/internal/domain/plugin"
)

// Service implements plugindom.Service.
type Service struct {
	repo plugindom.Repository
}

// New creates a Service wired to the given repository.
func New(repo plugindom.Repository) *Service {
	return &Service{repo: repo}
}

// ListPlugins returns all installed plugins.
func (s *Service) ListPlugins(ctx context.Context) ([]*plugindom.Plugin, error) {
	return s.repo.List(ctx)
}

// InstallPlugin validates and inserts a new plugin into the registry.
func (s *Service) InstallPlugin(ctx context.Context, input plugindom.InstallInput) (*plugindom.Plugin, error) {
	if input.Name == "" {
		return nil, fmt.Errorf("plugin name is required")
	}
	now := time.Now()
	p := &plugindom.Plugin{
		ID:          uuid.New(),
		Name:        input.Name,
		Version:     input.Version,
		Manifest:    input.Manifest,
		Enabled:     input.Enabled,
		InstalledAt: now,
		UpdatedAt:   now,
	}
	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// UpdatePlugin patches an existing plugin's mutable fields.
func (s *Service) UpdatePlugin(ctx context.Context, id uuid.UUID, input plugindom.UpdateInput) (*plugindom.Plugin, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if input.Version != nil {
		p.Version = *input.Version
	}
	if input.Manifest != nil {
		p.Manifest = *input.Manifest
	}
	if input.Enabled != nil {
		p.Enabled = *input.Enabled
	}
	p.UpdatedAt = time.Now()
	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// DeletePlugin removes a plugin from the registry.
func (s *Service) DeletePlugin(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}

// UpdateExtensionSetting upserts a system-wide extension-point setting.
func (s *Service) UpdateExtensionSetting(ctx context.Context, input plugindom.UpdateExtensionSettingInput) (*plugindom.PluginExtensionSetting, error) {
	setting := &plugindom.PluginExtensionSetting{
		ID:             uuid.New(),
		PluginID:       input.PluginID,
		ExtensionPoint: input.ExtensionPoint,
		Settings:       input.Settings,
		UpdatedAt:      time.Now(),
	}
	if err := s.repo.UpsertSetting(ctx, setting); err != nil {
		return nil, err
	}
	return setting, nil
}

// ListExtensionSettings returns all extension settings for the given plugin.
func (s *Service) ListExtensionSettings(ctx context.Context, pluginID uuid.UUID) ([]*plugindom.PluginExtensionSetting, error) {
	return s.repo.ListSettings(ctx, pluginID)
}
