package docsvc

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	docdom "github.com/paca/api/internal/domain/doc"
	projectdom "github.com/paca/api/internal/domain/project"
)

// memberLookup is the minimal interface ActivitySvc needs to resolve a user
// UUID to a project member UUID.
type memberLookup interface {
	FindMemberByUserProject(ctx context.Context, userID, projectID uuid.UUID) (*projectdom.ProjectMember, error)
}

// ActivitySvc implements docdom.ActivityService (which includes
// docdom.ActivityRecorder via embedding).
type ActivitySvc struct {
	repo       docdom.ActivityRepository
	memberRepo memberLookup
}

// NewActivityService creates a new ActivitySvc backed by repo.
// memberRepo is used to resolve user UUIDs to project-member UUIDs for comment
// operations; it may be nil (lookups will return ErrMemberNotFound).
func NewActivityService(repo docdom.ActivityRepository, memberRepo memberLookup) *ActivitySvc {
	return &ActivitySvc{repo: repo, memberRepo: memberRepo}
}

// --- ActivityRecorder -------------------------------------------------------

// RecordActivity directly writes a system-generated activity entry to the
// database (documents have no streaming worker — we write synchronously).
func (s *ActivitySvc) RecordActivity(ctx context.Context, a *docdom.Activity) error {
	if len(a.Content) == 0 {
		a.Content = json.RawMessage("{}")
	}
	return s.repo.CreateActivity(ctx, a)
}

// --- ActivityService --------------------------------------------------------

// ListActivities returns all non-deleted activities for a document, oldest first.
func (s *ActivitySvc) ListActivities(ctx context.Context, documentID uuid.UUID) ([]*docdom.Activity, error) {
	return s.repo.ListActivities(ctx, documentID)
}

// AddComment creates a user comment on the document.
func (s *ActivitySvc) AddComment(ctx context.Context, in docdom.AddCommentInput) (*docdom.Activity, error) {
	text := strings.TrimSpace(in.Text)
	if text == "" {
		return nil, docdom.ErrCommentTextInvalid
	}
	member, err := s.memberRepo.FindMemberByUserProject(ctx, in.ActorID, in.ProjectID)
	if err != nil {
		return nil, err
	}
	content, _ := json.Marshal(map[string]string{"text": text})
	now := time.Now()
	a := &docdom.Activity{
		ID:           uuid.New(),
		DocumentID:   in.DocumentID,
		ActorID:      &member.ID,
		ActivityType: docdom.ActivityTypeComment,
		Content:      content,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := s.repo.CreateActivity(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// UpdateComment edits the text of an existing comment.
func (s *ActivitySvc) UpdateComment(ctx context.Context, id uuid.UUID, projectID uuid.UUID, actorID uuid.UUID, text string) (*docdom.Activity, error) {
	a, err := s.repo.FindActivityByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if a.ActivityType != docdom.ActivityTypeComment {
		return nil, docdom.ErrActivityNotAComment
	}

	member, err := s.memberRepo.FindMemberByUserProject(ctx, actorID, projectID)
	if err != nil {
		return nil, err
	}
	if a.ActorID == nil || *a.ActorID != member.ID {
		return nil, docdom.ErrActivityForbidden
	}

	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil, docdom.ErrCommentTextInvalid
	}
	content, _ := json.Marshal(map[string]string{"text": trimmed})
	a.Content = content
	a.UpdatedAt = time.Now()
	if err := s.repo.UpdateActivity(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// DeleteComment soft-deletes a comment.
func (s *ActivitySvc) DeleteComment(ctx context.Context, id uuid.UUID, projectID uuid.UUID, actorID uuid.UUID) error {
	a, err := s.repo.FindActivityByID(ctx, id)
	if err != nil {
		return err
	}
	if a.ActivityType != docdom.ActivityTypeComment {
		return docdom.ErrActivityNotAComment
	}

	member, err := s.memberRepo.FindMemberByUserProject(ctx, actorID, projectID)
	if err != nil {
		return err
	}
	if a.ActorID == nil || *a.ActorID != member.ID {
		return docdom.ErrActivityForbidden
	}

	return s.repo.DeleteActivity(ctx, id)
}
