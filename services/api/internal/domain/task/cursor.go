package taskdom

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// TaskCursor holds the stable ordering fields for keyset-based pagination.
// Both the HTTP handler (encoding) and the postgres repository (decoding)
// must use this type so any change to the JSON tags is caught at compile time.
//
// SortBy carries the active sort key so the repository can reconstruct the
// correct keyset WHERE predicate on subsequent pages.  Old cursors that omit
// SortBy fall back to the default (created_at, id) ordering.
type TaskCursor struct {
	CreatedAt   time.Time `json:"ca"`
	ID          string    `json:"id"`
	SortBy      string    `json:"sb,omitempty"`
	SortNumVal  *float64  `json:"snv,omitempty"` // importance, story_points, number custom field (nil → NULL)
	SortStrVal  *string   `json:"ssv,omitempty"` // title, select custom field raw value (nil → NULL)
	SortTimeVal *string   `json:"stv,omitempty"` // start_date, due_date, date custom field as "2006-01-02" (nil → NULL)
}

// EncodeTaskCursor builds an opaque base64 cursor from the last task on a page
// and the active sort configuration.  The sort key and field value are embedded
// so the next-page query can reconstruct the correct keyset predicate for both
// built-in fields and custom field sorts.
func EncodeTaskCursor(t *Task, sort TaskSort) string {
	cur := TaskCursor{
		CreatedAt: t.CreatedAt.UTC(),
		ID:        t.ID.String(),
		SortBy:    sort.By,
	}
	switch sort.By {
	case "view_position":
		cur.SortNumVal = t.ViewPosition // nil when the task has no saved position
	case "importance":
		v := float64(t.Importance)
		cur.SortNumVal = &v
	case "story_points":
		if t.StoryPoints != nil {
			v := float64(*t.StoryPoints)
			cur.SortNumVal = &v
		}
	case "title":
		cur.SortStrVal = &t.Title
	case "start_date":
		if t.StartDate != nil {
			s := t.StartDate.Format("2006-01-02")
			cur.SortTimeVal = &s
		}
	case "due_date":
		if t.DueDate != nil {
			s := t.DueDate.Format("2006-01-02")
			cur.SortTimeVal = &s
		}
	default:
		// Custom field sort — extract the raw value from CustomFields.
		if sort.By != "" && sort.CFType != "" {
			val := t.CustomFields[sort.By]
			switch sort.CFType {
			case "number":
				if val != nil {
					switch n := val.(type) {
					case float64:
						cur.SortNumVal = &n
					case int:
						f := float64(n)
						cur.SortNumVal = &f
					}
				}
			case "date":
				if s, ok := val.(string); ok && s != "" {
					cur.SortTimeVal = &s
				}
			case "select":
				if s, ok := val.(string); ok {
					cur.SortStrVal = &s
				}
			}
		}
	}
	b, _ := json.Marshal(cur)
	return base64.URLEncoding.EncodeToString(b)
}

// DecodeTaskCursor parses a cursor token produced by EncodeTaskCursor.
func DecodeTaskCursor(s string) (*TaskCursor, error) {
	b, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("decode cursor base64: %w", err)
	}
	var c TaskCursor
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("decode cursor json: %w", err)
	}
	c.CreatedAt = c.CreatedAt.UTC()
	return &c, nil
}
