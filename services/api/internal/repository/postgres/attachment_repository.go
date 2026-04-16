package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	attachmentdom "github.com/paca/api/internal/domain/attachment"
	"gorm.io/gorm"
)

// --- GORM models -----------------------------------------------------------

type fileRecord struct {
	ID                string  `gorm:"primarykey;type:uuid"`
	StorageKey        string  `gorm:"not null;unique;column:storage_key"`
	Bucket            string  `gorm:"not null"`
	FileName          string  `gorm:"not null;column:file_name"`
	ContentType       string  `gorm:"not null;default:application/octet-stream;column:content_type"`
	FileSize          int64   `gorm:"not null;default:0;column:file_size"`
	UploadStatus      string  `gorm:"not null;default:pending;column:upload_status"`
	MultipartUploadID *string `gorm:"type:text;column:multipart_upload_id"`
	UploadedBy        *string `gorm:"type:uuid;column:uploaded_by"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (fileRecord) TableName() string { return "files" }

type taskAttachmentRecord struct {
	ID        string  `gorm:"primarykey;type:uuid"`
	TaskID    string  `gorm:"not null;type:uuid;column:task_id"`
	FileID    string  `gorm:"not null;type:uuid;column:file_id"`
	CreatedBy *string `gorm:"type:uuid;column:created_by"`
	CreatedAt time.Time
	File      *fileRecord `gorm:"foreignKey:FileID;references:ID"`
}

func (taskAttachmentRecord) TableName() string { return "task_attachments" }

// --- Repository ------------------------------------------------------------

// AttachmentRepository is the GORM implementation of attachmentdom.Repository.
type AttachmentRepository struct {
	db *gorm.DB
}

// NewAttachmentRepository returns a new AttachmentRepository.
func NewAttachmentRepository(db *gorm.DB) *AttachmentRepository {
	return &AttachmentRepository{db: db}
}

// --- File ------------------------------------------------------------------

// CreateFile inserts a new file metadata record.
func (r *AttachmentRepository) CreateFile(ctx context.Context, f *attachmentdom.File) error {
	rec := fileRecord{
		ID:                f.ID.String(),
		StorageKey:        f.StorageKey,
		Bucket:            f.Bucket,
		FileName:          f.FileName,
		ContentType:       f.ContentType,
		FileSize:          f.FileSize,
		UploadStatus:      string(f.UploadStatus),
		MultipartUploadID: f.MultipartUploadID,
		UploadedBy:        uuidPtrToStringPtr(f.UploadedBy),
		CreatedAt:         f.CreatedAt,
		UpdatedAt:         f.UpdatedAt,
	}
	if err := r.db.WithContext(ctx).Create(&rec).Error; err != nil {
		return fmt.Errorf("attachment repo: create file: %w", err)
	}
	return nil
}

// FindFileByID returns the file with the given ID.
func (r *AttachmentRepository) FindFileByID(ctx context.Context, id uuid.UUID) (*attachmentdom.File, error) {
	var rec fileRecord
	err := r.db.WithContext(ctx).Where("id = ?", id.String()).First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, attachmentdom.ErrFileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("attachment repo: find file: %w", err)
	}
	return fileRecordToEntity(&rec), nil
}

// UpdateFileStatus updates the upload_status and multipart_upload_id of a file.
func (r *AttachmentRepository) UpdateFileStatus(ctx context.Context, id uuid.UUID, status attachmentdom.UploadStatus, multipartUploadID *string) error {
	result := r.db.WithContext(ctx).Model(&fileRecord{}).
		Where("id = ?", id.String()).
		Updates(map[string]any{
			"upload_status":       string(status),
			"multipart_upload_id": multipartUploadID,
			"updated_at":          time.Now(),
		})
	if result.Error != nil {
		return fmt.Errorf("attachment repo: update file status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return attachmentdom.ErrFileNotFound
	}
	return nil
}

// DeleteFile removes a file record permanently.
func (r *AttachmentRepository) DeleteFile(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Where("id = ?", id.String()).Delete(&fileRecord{})
	if result.Error != nil {
		return fmt.Errorf("attachment repo: delete file: %w", result.Error)
	}
	return nil
}

// --- Task attachments ------------------------------------------------------

// ListTaskAttachments returns all task attachments for the given task,
// with the associated file metadata eagerly loaded.
func (r *AttachmentRepository) ListTaskAttachments(ctx context.Context, taskID uuid.UUID) ([]*attachmentdom.TaskAttachment, error) {
	var records []taskAttachmentRecord
	if err := r.db.WithContext(ctx).
		Preload("File").
		Where("task_id = ?", taskID.String()).
		Order("created_at ASC").
		Find(&records).Error; err != nil {
		return nil, fmt.Errorf("attachment repo: list task attachments: %w", err)
	}
	result := make([]*attachmentdom.TaskAttachment, 0, len(records))
	for _, rec := range records {
		result = append(result, taskAttachmentRecordToEntity(&rec))
	}
	return result, nil
}

// FindTaskAttachmentByID returns a single task attachment by ID.
func (r *AttachmentRepository) FindTaskAttachmentByID(ctx context.Context, id uuid.UUID) (*attachmentdom.TaskAttachment, error) {
	var rec taskAttachmentRecord
	err := r.db.WithContext(ctx).
		Preload("File").
		Where("id = ?", id.String()).
		First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, attachmentdom.ErrAttachmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("attachment repo: find task attachment: %w", err)
	}
	return taskAttachmentRecordToEntity(&rec), nil
}

// CreateTaskAttachment inserts a new task-attachment join record.
func (r *AttachmentRepository) CreateTaskAttachment(ctx context.Context, a *attachmentdom.TaskAttachment) error {
	rec := taskAttachmentRecord{
		ID:        a.ID.String(),
		TaskID:    a.TaskID.String(),
		FileID:    a.FileID.String(),
		CreatedBy: uuidPtrToStringPtr(a.CreatedBy),
		CreatedAt: a.CreatedAt,
	}
	if err := r.db.WithContext(ctx).Create(&rec).Error; err != nil {
		return fmt.Errorf("attachment repo: create task attachment: %w", err)
	}
	return nil
}

// DeleteTaskAttachment removes a task attachment by ID.
func (r *AttachmentRepository) DeleteTaskAttachment(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Where("id = ?", id.String()).Delete(&taskAttachmentRecord{})
	if result.Error != nil {
		return fmt.Errorf("attachment repo: delete task attachment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return attachmentdom.ErrAttachmentNotFound
	}
	return nil
}

// --- helpers ---------------------------------------------------------------

func fileRecordToEntity(r *fileRecord) *attachmentdom.File {
	f := &attachmentdom.File{
		ID:                mustParseUUID(r.ID),
		StorageKey:        r.StorageKey,
		Bucket:            r.Bucket,
		FileName:          r.FileName,
		ContentType:       r.ContentType,
		FileSize:          r.FileSize,
		UploadStatus:      attachmentdom.UploadStatus(r.UploadStatus),
		MultipartUploadID: r.MultipartUploadID,
		UploadedBy:        stringPtrToUUIDPtr(r.UploadedBy),
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
	return f
}

func taskAttachmentRecordToEntity(r *taskAttachmentRecord) *attachmentdom.TaskAttachment {
	a := &attachmentdom.TaskAttachment{
		ID:        mustParseUUID(r.ID),
		TaskID:    mustParseUUID(r.TaskID),
		FileID:    mustParseUUID(r.FileID),
		CreatedBy: stringPtrToUUIDPtr(r.CreatedBy),
		CreatedAt: r.CreatedAt,
	}
	if r.File != nil {
		a.File = fileRecordToEntity(r.File)
	}
	return a
}

func uuidPtrToStringPtr(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	s := id.String()
	return &s
}

func stringPtrToUUIDPtr(s *string) *uuid.UUID {
	if s == nil {
		return nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return nil
	}
	return &id
}

func mustParseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}
