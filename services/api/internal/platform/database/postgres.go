// Package database provides PostgreSQL connectivity via GORM.
// It supports two drivers:
//   - "postgres" (default): standard PostgreSQL via pgx.
//   - "dsql": Amazon Aurora DSQL using short-lived IAM auth tokens, refreshed
//     automatically on every new connection via pgxpool.BeforeConnect.
package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	dsqlauth "github.com/aws/aws-sdk-go-v2/feature/dsql/auth"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Config holds the settings required to open a database connection.
type Config struct {
	// DSN is the PostgreSQL connection string.
	// For the "dsql" driver the DSN should omit the password; an IAM auth
	// token is injected automatically before each new connection.
	DSN string

	// Driver selects the backend: "postgres" (default) or "dsql".
	Driver string

	// AWSRegion is required when Driver is "dsql".
	AWSRegion string
}

// Open establishes a GORM connection using the driver specified in cfg.
func Open(cfg Config, log *slog.Logger) (*gorm.DB, error) {
	if cfg.Driver == "dsql" {
		return openDSQL(cfg, log)
	}
	return openPostgres(cfg.DSN, log)
}

// openPostgres opens a standard PostgreSQL connection via gorm+pgx.
func openPostgres(dsn string, log *slog.Logger) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("database: open: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("database: get sql.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("database: ping: %w", err)
	}

	log.Info("database connected")
	return db, nil
}

// openDSQL opens an Aurora DSQL connection.
//
// IAM auth tokens are valid for 15 minutes.  A pgxpool with BeforeConnect
// regenerates the token for every new physical connection, so the pool never
// holds a connection whose token has already expired.  MaxConnLifetime is set
// to 13 minutes as an extra safeguard.
func openDSQL(cfg Config, log *slog.Logger) (*gorm.DB, error) {
	ctx := context.Background()

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.AWSRegion))
	if err != nil {
		return nil, fmt.Errorf("database: dsql: load aws config: %w", err)
	}

	poolCfg, err := pgxpool.ParseConfig(cfg.DSN)
	if err != nil {
		return nil, fmt.Errorf("database: dsql: parse dsn: %w", err)
	}

	endpoint := poolCfg.ConnConfig.Host
	isAdmin := poolCfg.ConnConfig.User == "admin"

	poolCfg.MaxConns = 25
	poolCfg.MinConns = 0
	poolCfg.MaxConnLifetime = 13 * time.Minute

	poolCfg.BeforeConnect = func(ctx context.Context, connCfg *pgx.ConnConfig) error {
		var token string
		var tokenErr error
		if isAdmin {
			token, tokenErr = dsqlauth.GenerateDBConnectAdminAuthToken(
				ctx, endpoint, cfg.AWSRegion, awsCfg.Credentials,
			)
		} else {
			token, tokenErr = dsqlauth.GenerateDbConnectAuthToken(
				ctx, endpoint, cfg.AWSRegion, awsCfg.Credentials,
			)
		}
		if tokenErr != nil {
			return fmt.Errorf("database: dsql: generate auth token: %w", tokenErr)
		}
		connCfg.Password = token
		return nil
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("database: dsql: create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database: dsql: ping: %w", err)
	}

	sqlDB := stdlib.OpenDBFromPool(pool)

	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("database: dsql: open gorm: %w", err)
	}

	log.Info("database connected", "driver", "dsql", "endpoint", endpoint)
	return db, nil
}
