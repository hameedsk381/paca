package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	plugindom "github.com/Paca-AI/api/internal/domain/plugin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// -------------------------------------------------------------------------
// GORM models
// -------------------------------------------------------------------------

type pluginModel struct {
	ID          string          `gorm:"primarykey;type:uuid"`
	Name        string          `gorm:"column:name;not null;uniqueIndex"`
	Version     string          `gorm:"column:version;not null;default:'0.0.0'"`
	Manifest    json.RawMessage `gorm:"column:manifest;type:jsonb;not null;default:'{}'"`
	Enabled     bool            `gorm:"column:enabled;not null;default:true"`
	InstalledAt time.Time       `gorm:"column:installed_at;not null"`
	UpdatedAt   time.Time       `gorm:"column:updated_at;not null"`
}

func (pluginModel) TableName() string { return "plugins" }

type pluginExtensionSettingModel struct {
	ID             string          `gorm:"primarykey;type:uuid"`
	PluginID       string          `gorm:"column:plugin_id;type:uuid;not null"`
	ExtensionPoint string          `gorm:"column:extension_point;not null"`
	Settings       json.RawMessage `gorm:"column:settings;type:jsonb;not null;default:'{}'"`
	UpdatedAt      time.Time       `gorm:"column:updated_at;not null"`
}

func (pluginExtensionSettingModel) TableName() string { return "plugin_extension_settings" }

// -------------------------------------------------------------------------
// Conversion helpers
// -------------------------------------------------------------------------

func pluginFromModel(m *pluginModel) (*plugindom.Plugin, error) {
	id, err := uuid.Parse(m.ID)
	if err != nil {
		return nil, err
	}
	var manifest plugindom.PluginManifest
	if len(m.Manifest) > 0 {
		if err := json.Unmarshal(m.Manifest, &manifest); err != nil {
			return nil, err
		}
	}
	return &plugindom.Plugin{
		ID:          id,
		Name:        m.Name,
		Version:     m.Version,
		Manifest:    manifest,
		Enabled:     m.Enabled,
		InstalledAt: m.InstalledAt,
		UpdatedAt:   m.UpdatedAt,
	}, nil
}

func pluginToModel(p *plugindom.Plugin) (*pluginModel, error) {
	manifestBytes, err := json.Marshal(p.Manifest)
	if err != nil {
		return nil, err
	}
	return &pluginModel{
		ID:          p.ID.String(),
		Name:        p.Name,
		Version:     p.Version,
		Manifest:    json.RawMessage(manifestBytes),
		Enabled:     p.Enabled,
		InstalledAt: p.InstalledAt,
		UpdatedAt:   p.UpdatedAt,
	}, nil
}

func settingFromModel(m *pluginExtensionSettingModel) (*plugindom.PluginExtensionSetting, error) {
	id, err := uuid.Parse(m.ID)
	if err != nil {
		return nil, err
	}
	pluginID, err := uuid.Parse(m.PluginID)
	if err != nil {
		return nil, err
	}
	var settings plugindom.ExtensionSettingData
	if len(m.Settings) > 0 {
		if err := json.Unmarshal(m.Settings, &settings); err != nil {
			return nil, err
		}
	}
	return &plugindom.PluginExtensionSetting{
		ID:             id,
		PluginID:       pluginID,
		ExtensionPoint: m.ExtensionPoint,
		Settings:       settings,
		UpdatedAt:      m.UpdatedAt,
	}, nil
}

// -------------------------------------------------------------------------
// PluginRepository (implements plugindom.Repository)
// -------------------------------------------------------------------------

// PluginRepository is the PostgreSQL-backed implementation of plugindom.Repository.
type PluginRepository struct {
	db *gorm.DB
}

// NewPluginRepository creates a PluginRepository backed by the given GORM DB.
func NewPluginRepository(db *gorm.DB) *PluginRepository {
	return &PluginRepository{db: db}
}

// List returns all plugins ordered by name.
func (r *PluginRepository) List(ctx context.Context) ([]*plugindom.Plugin, error) {
	var models []*pluginModel
	if err := r.db.WithContext(ctx).Order("name").Find(&models).Error; err != nil {
		return nil, err
	}
	plugins := make([]*plugindom.Plugin, 0, len(models))
	for _, m := range models {
		p, err := pluginFromModel(m)
		if err != nil {
			return nil, err
		}
		plugins = append(plugins, p)
	}
	return plugins, nil
}

// FindByID returns the plugin with the given ID.
func (r *PluginRepository) FindByID(ctx context.Context, id uuid.UUID) (*plugindom.Plugin, error) {
	var m pluginModel
	err := r.db.WithContext(ctx).Where("id = ?", id.String()).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, plugindom.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return pluginFromModel(&m)
}

// FindByName returns the plugin with the given name.
func (r *PluginRepository) FindByName(ctx context.Context, name string) (*plugindom.Plugin, error) {
	var m pluginModel
	err := r.db.WithContext(ctx).Where("name = ?", name).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, plugindom.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return pluginFromModel(&m)
}

// Create inserts a new plugin into the registry.
func (r *PluginRepository) Create(ctx context.Context, p *plugindom.Plugin) error {
	m, err := pluginToModel(p)
	if err != nil {
		return err
	}
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		if isUniqueViolation(err) {
			return plugindom.ErrNameTaken
		}
		return err
	}
	return nil
}

// Update replaces mutable fields of an existing plugin.
func (r *PluginRepository) Update(ctx context.Context, p *plugindom.Plugin) error {
	manifestBytes, err := json.Marshal(p.Manifest)
	if err != nil {
		return err
	}
	result := r.db.WithContext(ctx).Model(&pluginModel{}).
		Where("id = ?", p.ID.String()).
		Updates(map[string]any{
			"version":    p.Version,
			"manifest":   json.RawMessage(manifestBytes),
			"enabled":    p.Enabled,
			"updated_at": p.UpdatedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return plugindom.ErrNotFound
	}
	return nil
}

// Delete removes a plugin and all associated extension settings.
func (r *PluginRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Where("id = ?", id.String()).Delete(&pluginModel{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return plugindom.ErrNotFound
	}
	return nil
}

// -------------------------------------------------------------------------
// PluginExtensionSettingRepository
// -------------------------------------------------------------------------

// ListSettings returns all extension settings for the given plugin.
func (r *PluginRepository) ListSettings(ctx context.Context, pluginID uuid.UUID) ([]*plugindom.PluginExtensionSetting, error) {
	var models []*pluginExtensionSettingModel
	if err := r.db.WithContext(ctx).
		Where("plugin_id = ?", pluginID.String()).
		Find(&models).Error; err != nil {
		return nil, err
	}
	settings := make([]*plugindom.PluginExtensionSetting, 0, len(models))
	for _, m := range models {
		s, err := settingFromModel(m)
		if err != nil {
			return nil, err
		}
		settings = append(settings, s)
	}
	return settings, nil
}

// ListSettingsForPlugins returns all extension settings for the given plugins.
func (r *PluginRepository) ListSettingsForPlugins(
	ctx context.Context,
	pluginIDs []uuid.UUID,
) ([]*plugindom.PluginExtensionSetting, error) {
	if len(pluginIDs) == 0 {
		return []*plugindom.PluginExtensionSetting{}, nil
	}

	ids := make([]string, 0, len(pluginIDs))
	for _, id := range pluginIDs {
		ids = append(ids, id.String())
	}

	var models []*pluginExtensionSettingModel
	if err := r.db.WithContext(ctx).
		Where("plugin_id IN ?", ids).
		Find(&models).Error; err != nil {
		return nil, err
	}

	settings := make([]*plugindom.PluginExtensionSetting, 0, len(models))
	for _, m := range models {
		s, err := settingFromModel(m)
		if err != nil {
			return nil, err
		}
		settings = append(settings, s)
	}

	return settings, nil
}

// UpsertSetting creates or replaces the settings row for (plugin, extension_point).
func (r *PluginRepository) UpsertSetting(ctx context.Context, setting *plugindom.PluginExtensionSetting) error {
	settingsBytes, err := json.Marshal(setting.Settings)
	if err != nil {
		return err
	}
	m := &pluginExtensionSettingModel{
		ID:             setting.ID.String(),
		PluginID:       setting.PluginID.String(),
		ExtensionPoint: setting.ExtensionPoint,
		Settings:       json.RawMessage(settingsBytes),
		UpdatedAt:      setting.UpdatedAt,
	}
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "plugin_id"}, {Name: "extension_point"}},
			DoUpdates: clause.AssignmentColumns([]string{"settings", "updated_at"}),
		}).
		Create(m).Error
}
