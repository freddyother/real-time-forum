package models

import (
	"context"
	"database/sql"
	"strings"
)

type MessageModel struct {
	DB *sql.DB
}

// ListBetween returns messages between userID and otherUserID ordered oldest->newest.
// Supports pagination via offset/limit (offset is from the newest side using the inner ORDER BY DESC).
func (m *MessageModel) ListBetween(ctx context.Context, userID, otherUserID int64, limit, offset int) ([]Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	// We fetch newest first, apply LIMIT/OFFSET, then reverse to oldest->newest.
	// This gives stable pagination and renders nicely in UI.
	const q = `
SELECT id, from_user_id, to_user_id, content, sent_at, seen, seen_at
FROM messages
WHERE (from_user_id = ? AND to_user_id = ?)
   OR (from_user_id = ? AND to_user_id = ?)
ORDER BY sent_at DESC, id DESC
LIMIT ? OFFSET ?;
`

	rows, err := m.DB.QueryContext(ctx, q, userID, otherUserID, otherUserID, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var seenInt int
	var seenAt sql.NullTime
	var tmp []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(
			&msg.ID, &msg.FromUserID, &msg.ToUserID, &msg.Content, &msg.SentAt,
			&seenInt, &seenAt,
		); err != nil {
			return nil, err
		}
		msg.Seen = seenInt == 1
		if seenAt.Valid {
			t := seenAt.Time
			msg.SeenAt = &t
		}
		tmp = append(tmp, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// reverse to oldest->newest
	for i, j := 0, len(tmp)-1; i < j; i, j = i+1, j-1 {
		tmp[i], tmp[j] = tmp[j], tmp[i]
	}

	return tmp, nil
}

func (m *MessageModel) Create(ctx context.Context, fromUserID, toUserID int64, content string) (*Message, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, sql.ErrNoRows // simple “signal” error; handler lo convierte a 400
	}

	const q = `
INSERT INTO messages (from_user_id, to_user_id, content)
VALUES (?, ?, ?)
RETURNING id, from_user_id, to_user_id, content, sent_at;
`

	var msg Message
	err := m.DB.QueryRowContext(ctx, q, fromUserID, toUserID, content).Scan(
		&msg.ID, &msg.FromUserID, &msg.ToUserID, &msg.Content, &msg.SentAt,
	)
	if err != nil {
		return nil, err
	}

	return &msg, nil
}
