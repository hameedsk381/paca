// Package middleware provides per-route HTTP middleware for authentication and
// authorization.
package middleware

import (
	"context"
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/paca/api/internal/apierr"
	apikeydom "github.com/paca/api/internal/domain/apikey"
	domainauth "github.com/paca/api/internal/domain/auth"
	jwttoken "github.com/paca/api/internal/platform/token"
	"github.com/paca/api/internal/transport/http/presenter"
)

const claimsKey = "claims"
const authMethodKey = "auth_method"

// actorContextKey is the unexported key used to store the authenticated user's
// UUID in the Go request context.
type actorContextKey struct{}

// APIKeyAuthenticator validates a raw API key string and returns the key record.
// It is satisfied by apikeysvc.Service.
type APIKeyAuthenticator interface {
	Authenticate(ctx context.Context, rawKey string) (*apikeydom.APIKey, error)
}

// Authn validates the access JWT and stores the parsed claims in the Gin
// context as well as the caller's user UUID in the Go request context so
// service-layer code can access it without depending on Gin.
// It first checks the access_token HttpOnly cookie, then falls back to the
// Authorization: Bearer header for API/CLI clients, and finally accepts
// Authorization: ApiKey or X-API-Key headers for API key authentication.
func Authn(tm *jwttoken.Manager, apiKeyAuth ...APIKeyAuthenticator) gin.HandlerFunc {
	var apiKeyAuthenticator APIKeyAuthenticator
	if len(apiKeyAuth) > 0 {
		apiKeyAuthenticator = apiKeyAuth[0]
	}
	return func(c *gin.Context) {
		tokenStr := ""
		isAPIKey := false

		// 1. Try the access_token cookie (browser clients).
		if cookie, err := c.Cookie("access_token"); err == nil && cookie != "" {
			tokenStr = cookie
		}

		// 2. Fall back to Authorization header (API/CLI clients).
		if tokenStr == "" {
			header := c.GetHeader("Authorization")
			if header != "" {
				parts := strings.SplitN(header, " ", 2)
				if len(parts) == 2 {
					switch strings.ToLower(parts[0]) {
					case "bearer":
						tokenStr = parts[1]
					case "apikey":
						tokenStr = parts[1]
						isAPIKey = true
					}
				}
			}
		}

		// 3. Try X-API-Key header.
		if tokenStr == "" {
			if v := c.GetHeader("X-API-Key"); v != "" {
				tokenStr = v
				isAPIKey = true
			}
		}

		if tokenStr == "" {
			presenter.Error(c, apierr.New(apierr.CodeMissingToken, "missing authentication"))
			return
		}

		// --- API key path ---
		if isAPIKey {
			if apiKeyAuthenticator == nil {
				presenter.Error(c, apierr.New(apierr.CodeUnauthenticated, "API key authentication not configured"))
				return
			}
			key, err := apiKeyAuthenticator.Authenticate(c.Request.Context(), tokenStr)
			if err != nil {
				switch {
				case errors.Is(err, apikeydom.ErrRevoked):
					presenter.Error(c, apierr.New(apierr.CodeAPIKeyRevoked, "API key has been revoked"))
				case errors.Is(err, apikeydom.ErrExpired):
					presenter.Error(c, apierr.New(apierr.CodeAPIKeyExpired, "API key has expired"))
				default:
					// Return a generic token-invalid code for not-found and unexpected
					// errors to avoid leaking key existence information.
					presenter.Error(c, apierr.New(apierr.CodeTokenInvalid, "invalid or expired API key"))
				}
				return
			}
			// Build synthetic claims so downstream handlers work unchanged.
			syntheticClaims := &domainauth.Claims{
				RegisteredClaims: jwt.RegisteredClaims{
					Subject: key.UserID.String(),
				},
				Kind: "access",
			}
			c.Set(claimsKey, syntheticClaims)
			c.Set(authMethodKey, "apikey")
			ctx := context.WithValue(c.Request.Context(), actorContextKey{}, key.UserID)
			c.Request = c.Request.WithContext(ctx)
			c.Next()
			return
		}

		// --- JWT path ---
		claims, err := tm.Verify(tokenStr)
		if err != nil {
			presenter.Error(c, apierr.New(apierr.CodeTokenInvalid, "invalid or expired token"))
			return
		}

		if claims.Kind != "access" {
			presenter.Error(c, apierr.New(apierr.CodeTokenInvalid, "expected access token"))
			return
		}

		c.Set(claimsKey, claims)

		// Embed the actor UUID in the Go request context so service layers can
		// read it without coupling to Gin.
		if actorID, parseErr := uuid.Parse(claims.Subject); parseErr == nil {
			ctx := context.WithValue(c.Request.Context(), actorContextKey{}, actorID)
			c.Request = c.Request.WithContext(ctx)
		}

		c.Next()
	}
}

// OptionalAuthn tries to authenticate the request using the same credential
// sources as Authn (cookie → Bearer → API key), but does NOT abort if no
// credentials are present.  Downstream handlers must check ClaimsFrom for nil
// to determine whether the caller is authenticated.
func OptionalAuthn(tm *jwttoken.Manager, apiKeyAuth ...APIKeyAuthenticator) gin.HandlerFunc {
	var apiKeyAuthenticator APIKeyAuthenticator
	if len(apiKeyAuth) > 0 {
		apiKeyAuthenticator = apiKeyAuth[0]
	}
	return func(c *gin.Context) {
		tokenStr := ""
		isAPIKey := false

		if cookie, err := c.Cookie("access_token"); err == nil && cookie != "" {
			tokenStr = cookie
		}
		if tokenStr == "" {
			header := c.GetHeader("Authorization")
			if header != "" {
				parts := strings.SplitN(header, " ", 2)
				if len(parts) == 2 {
					switch strings.ToLower(parts[0]) {
					case "bearer":
						tokenStr = parts[1]
					case "apikey":
						tokenStr = parts[1]
						isAPIKey = true
					}
				}
			}
		}
		if tokenStr == "" {
			if v := c.GetHeader("X-API-Key"); v != "" {
				tokenStr = v
				isAPIKey = true
			}
		}

		// No credentials at all — allow the request through as anonymous.
		if tokenStr == "" {
			c.Next()
			return
		}

		if isAPIKey {
			if apiKeyAuthenticator != nil {
				key, err := apiKeyAuthenticator.Authenticate(c.Request.Context(), tokenStr)
				if err == nil {
					syntheticClaims := &domainauth.Claims{
						RegisteredClaims: jwt.RegisteredClaims{
							Subject: key.UserID.String(),
						},
						Kind: "access",
					}
					c.Set(claimsKey, syntheticClaims)
					c.Set(authMethodKey, "apikey")
					ctx := context.WithValue(c.Request.Context(), actorContextKey{}, key.UserID)
					c.Request = c.Request.WithContext(ctx)
				}
			}
			c.Next()
			return
		}

		claims, err := tm.Verify(tokenStr)
		if err != nil || claims.Kind != "access" {
			// Invalid token provided — reject rather than silently downgrade.
			presenter.Error(c, apierr.New(apierr.CodeTokenInvalid, "invalid or expired token"))
			return
		}

		c.Set(claimsKey, claims)
		if actorID, parseErr := uuid.Parse(claims.Subject); parseErr == nil {
			ctx := context.WithValue(c.Request.Context(), actorContextKey{}, actorID)
			c.Request = c.Request.WithContext(ctx)
		}
		c.Next()
	}
}

// ClaimsFrom retrieves the authenticated claims from the Gin context.
// It returns nil if no claims are present (e.g. on unauthenticated routes).
func ClaimsFrom(c *gin.Context) *domainauth.Claims {
	v, exists := c.Get(claimsKey)
	if !exists {
		return nil
	}
	claims, _ := v.(*domainauth.Claims)
	return claims
}

// ClaimsContextKey returns the context key used to store JWT claims.
// Intended for use in tests that need to inject synthetic claims.
func ClaimsContextKey() string { return claimsKey }

// ActorIDFromContext extracts the authenticated user's UUID from a Go
// context.Context.  Returns (uuid.Nil, false) when no actor is set (e.g. in
// tests that don't go through the Authn middleware).
func ActorIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	v := ctx.Value(actorContextKey{})
	if v == nil {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}

// WithActorID returns a new context that carries actorID.
// Use in tests to simulate an authenticated caller.
func WithActorID(ctx context.Context, actorID uuid.UUID) context.Context {
	return context.WithValue(ctx, actorContextKey{}, actorID)
}

// IsAPIKeyAuth reports whether the current request was authenticated via an API
// key rather than a JWT/cookie session.
func IsAPIKeyAuth(c *gin.Context) bool {
	v, exists := c.Get(authMethodKey)
	if !exists {
		return false
	}
	return v == "apikey"
}

// RequireJWTAuth rejects requests that were authenticated via an API key.
// Apply this middleware to sensitive routes (e.g. API key management) that must
// only be reachable through a JWT/cookie session to prevent privilege escalation
// via a leaked API key.
func RequireJWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if IsAPIKeyAuth(c) {
			presenter.Error(c, apierr.New(apierr.CodeForbidden, "this endpoint requires session authentication and does not accept API key credentials"))
			return
		}
		c.Next()
	}
}
