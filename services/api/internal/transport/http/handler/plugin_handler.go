package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/paca/api/internal/apierr"
	plugindom "github.com/paca/api/internal/domain/plugin"
	pluginrt "github.com/paca/api/internal/platform/plugin"
	"github.com/paca/api/internal/transport/http/dto"
	"github.com/paca/api/internal/transport/http/middleware"
	"github.com/paca/api/internal/transport/http/presenter"
)

// PluginHandler handles plugin management endpoints.
type PluginHandler struct {
	svc     plugindom.Service
	runtime *pluginrt.Runtime
}

// NewPluginHandler creates a PluginHandler.
func NewPluginHandler(svc plugindom.Service, runtime *pluginrt.Runtime) *PluginHandler {
	return &PluginHandler{svc: svc, runtime: runtime}
}

// -------------------------------------------------------------------------
// PLUG-BE-10: Plugin management API
// -------------------------------------------------------------------------

// ListPlugins handles GET /api/v1/plugins.
func (h *PluginHandler) ListPlugins(c *gin.Context) {
	plugins, err := h.svc.ListPlugins(c.Request.Context())
	if err != nil {
		presenter.Error(c, err)
		return
	}
	presenter.OK(c, dto.PluginListResponseFromEntities(plugins))
}

// InstallPlugin handles POST /api/v1/admin/plugins.
func (h *PluginHandler) InstallPlugin(c *gin.Context) {
	var req dto.InstallPluginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		presenter.Error(c, apierr.New(apierr.CodeBadRequest, err.Error()))
		return
	}
	plugin, err := h.svc.InstallPlugin(c.Request.Context(), plugindom.InstallInput{
		Name:     req.Name,
		Version:  req.Version,
		Manifest: req.Manifest,
		Enabled:  req.Enabled,
	})
	if err != nil {
		presenter.Error(c, err)
		return
	}
	presenter.Created(c, dto.PluginResponseFromEntity(plugin))
}

// UpdatePlugin handles PATCH /api/v1/admin/plugins/:pluginId.
func (h *PluginHandler) UpdatePlugin(c *gin.Context) {
	id, err := parsePluginID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}
	var req dto.UpdatePluginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		presenter.Error(c, apierr.New(apierr.CodeBadRequest, err.Error()))
		return
	}
	plugin, err := h.svc.UpdatePlugin(c.Request.Context(), id, plugindom.UpdateInput{
		Version:  req.Version,
		Manifest: req.Manifest,
		Enabled:  req.Enabled,
	})
	if err != nil {
		presenter.Error(c, err)
		return
	}
	presenter.OK(c, dto.PluginResponseFromEntity(plugin))
}

// DeletePlugin handles DELETE /api/v1/admin/plugins/:pluginId.
func (h *PluginHandler) DeletePlugin(c *gin.Context) {
	id, err := parsePluginID(c)
	if err != nil {
		presenter.Error(c, err)
		return
	}
	if err := h.svc.DeletePlugin(c.Request.Context(), id); err != nil {
		presenter.Error(c, err)
		return
	}
	presenter.NoContent(c)
}

// -------------------------------------------------------------------------
// PLUG-BE-11: Plugin extension setting endpoint (admin-only)
// -------------------------------------------------------------------------

// UpdateExtensionSetting handles PATCH /api/v1/admin/plugin-extension-settings.
// Only the super admin may call this endpoint.
func (h *PluginHandler) UpdateExtensionSetting(c *gin.Context) {
	var req dto.UpdatePluginExtensionSettingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		presenter.Error(c, apierr.New(apierr.CodeBadRequest, err.Error()))
		return
	}

	setting, err := h.svc.UpdateExtensionSetting(c.Request.Context(), plugindom.UpdateExtensionSettingInput{
		PluginID:       req.PluginID,
		ExtensionPoint: req.ExtensionPoint,
		Settings:       req.Settings,
	})
	if err != nil {
		presenter.Error(c, err)
		return
	}
	presenter.OK(c, dto.PluginExtensionSettingFromEntity(setting))
}

// -------------------------------------------------------------------------
// PLUG-BE-08: Plugin route proxy
// -------------------------------------------------------------------------

// ProxyRequest handles any request under
// /api/v1/plugins/:pluginId/projects/:projectId/* and dispatches it to the
// matching plugin's HandleRequest WASM export.
func (h *PluginHandler) ProxyRequest(c *gin.Context) {
	if h.runtime == nil {
		presenter.Error(c, apierr.New(apierr.CodeInternalError, "plugin runtime not available"))
		return
	}

	pluginID := c.Param("pluginId")

	// Validate that the plugin exists and is enabled.
	plugin, err := h.svc.ListPlugins(c.Request.Context())
	if err != nil {
		presenter.Error(c, err)
		return
	}
	var found *plugindom.Plugin
	for _, p := range plugin {
		if p.Name == pluginID && p.Enabled {
			found = p
			break
		}
	}
	if found == nil {
		presenter.Error(c, apierr.New(apierr.CodePluginNotFound, "plugin not found or disabled"))
		return
	}

	// Build caller identity from JWT claims.
	claims := middleware.ClaimsFrom(c)
	callerID := ""
	callerRole := ""
	if claims != nil {
		callerID = claims.Subject
		callerRole = claims.Role
	}

	// Read request body.
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		presenter.Error(c, apierr.New(apierr.CodeBadRequest, "failed to read request body"))
		return
	}

	// Build flattened headers map (first value per header name).
	headers := make(map[string]string, len(c.Request.Header))
	for k, vs := range c.Request.Header {
		if len(vs) > 0 {
			headers[k] = vs[0]
		}
	}

	// The sub-path after /projects/:projectId/ is available as the wildcard param.
	subPath := c.Param("path")
	if subPath == "" {
		subPath = "/"
	}

	req := &pluginrt.PluginHTTPRequest{
		Method:     c.Request.Method,
		Path:       subPath,
		ProjectID:  c.Param("projectId"),
		CallerID:   callerID,
		CallerRole: callerRole,
		Headers:    headers,
		Body:       bodyBytes,
	}

	// Attach request to context for HTTP host functions.
	reqCtx := pluginrt.WithPluginRequest(c.Request.Context(), req)

	reqBytes, err := json.Marshal(req)
	if err != nil {
		presenter.Error(c, apierr.New(apierr.CodeInternalError, "failed to serialise request"))
		return
	}

	respBytes, err := h.runtime.HandleRequest(reqCtx, pluginID, reqBytes)
	if err != nil {
		presenter.Error(c, apierr.New(apierr.CodeInternalError, "plugin execution error: "+err.Error()))
		return
	}

	// Parse the plugin response envelope.
	var pluginResp struct {
		StatusCode  int               `json:"status_code"`
		ContentType string            `json:"content_type"`
		Body        json.RawMessage   `json:"body"`
		Headers     map[string]string `json:"headers"`
	}
	if err := json.Unmarshal(respBytes, &pluginResp); err != nil {
		// Fallback: send raw bytes as JSON.
		c.Data(http.StatusOK, "application/json", respBytes)
		return
	}

	statusCode := pluginResp.StatusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	contentType := pluginResp.ContentType
	if contentType == "" {
		contentType = "application/json"
	}

	for k, v := range pluginResp.Headers {
		if !strings.EqualFold(k, "Content-Type") {
			c.Header(k, v)
		}
	}

	c.Data(statusCode, contentType, pluginResp.Body)
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

func parsePluginID(c *gin.Context) (uuid.UUID, error) {
	raw := c.Param("pluginId")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, apierr.New(apierr.CodeBadRequest, "invalid pluginId: "+raw)
	}
	return id, nil
}
