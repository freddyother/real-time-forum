// internal/models/message_model.go
package models

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
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

	const q = `
SELECT id, from_user_id, to_user_id, content, sent_at,
       delivered, delivered_at,
       seen, seen_at
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

	var tmp []Message

	for rows.Next() {
		var msg Message

		var deliveredInt int
		var deliveredAt sql.NullTime
		var seenInt int
		var seenAt sql.NullTime

		if err := rows.Scan(
			&msg.ID,
			&msg.FromUserID,
			&msg.ToUserID,
			&msg.Content,
			&msg.SentAt,
			&deliveredInt,
			&deliveredAt,
			&seenInt,
			&seenAt,
		); err != nil {
			return nil, err
		}

		msg.Delivered = deliveredInt == 1
		if deliveredAt.Valid {
			t := deliveredAt.Time
			msg.DeliveredAt = &t
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
		return nil, sql.ErrNoRows
	}

	const q = `
INSERT INTO messages (from_user_id, to_user_id, content)
VALUES (?, ?, ?)
RETURNING id, from_user_id, to_user_id, content, sent_at,
          delivered, delivered_at,
          seen, seen_at;
`

	var msg Message

	var deliveredInt int
	var deliveredAt sql.NullTime
	var seenInt int
	var seenAt sql.NullTime

	err := m.DB.QueryRowContext(ctx, q, fromUserID, toUserID, content).Scan(
		&msg.ID,
		&msg.FromUserID,
		&msg.ToUserID,
		&msg.Content,
		&msg.SentAt,
		&deliveredInt,
		&deliveredAt,
		&seenInt,
		&seenAt,
	)
	if err != nil {
		return nil, err
	}

	msg.Delivered = deliveredInt == 1
	if deliveredAt.Valid {
		t := deliveredAt.Time
		msg.DeliveredAt = &t
	}

	msg.Seen = seenInt == 1
	if seenAt.Valid {
		t := seenAt.Time
		msg.SeenAt = &t
	}

	return &msg, nil
}

// MarkDelivered marks a message as delivered.
// receiverID MUST be the message's to_user_id, otherwise it returns sql.ErrNoRows.
func (m *MessageModel) MarkDelivered(ctx context.Context, receiverID, messageID int64) (fromUserID int64, deliveredAt time.Time, err error) {
	if receiverID <= 0 || messageID <= 0 {
		return 0, time.Time{}, sql.ErrNoRows
	}

	// Use a deterministic timestamp from Go to avoid timezone surprises.
	now := time.Now().UTC()

	// Only the recipient can mark delivered.
	// We only update if not already delivered.
	const upd = `
UPDATE messages
SET delivered = 1,
    delivered_at = ?
WHERE id = ?
  AND to_user_id = ?
  AND delivered = 0;
`
	res, err := m.DB.ExecContext(ctx, upd, now, messageID, receiverID)
	if err != nil {
		return 0, time.Time{}, err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return 0, time.Time{}, err
	}

	// If we updated something -> read from_user_id and delivered_at.
	// If we updated nothing -> it may already be delivered OR receiver mismatch OR not found.
	const sel = `
SELECT from_user_id, delivered_at
FROM messages
WHERE id = ?
  AND to_user_id = ?;
`
	var from int64
	var delAt sql.NullTime

	if err := m.DB.QueryRowContext(ctx, sel, messageID, receiverID).Scan(&from, &delAt); err != nil {
		// Not found or receiver mismatch
		return 0, time.Time{}, err
	}

	// If it was already delivered (affected==0) and delivered_at is NULL (shouldn't), fallback to now.
	if !delAt.Valid {
		// This only happens if the row exists but delivered_at isn't set (unexpected).
		// If affected==1, we know we set it.
		if affected == 1 {
			return from, now, nil
		}
		return from, time.Now().UTC(), nil
	}

	return from, delAt.Time.UTC(), nil
}

// MarkSeenConversation marks as seen all messages from otherUserID -> viewerID that are not seen yet.
// Returns seenUpToID = max(id) of the messages that were marked seen.
// If there is nothing to mark, it returns (0, time.Time{}, nil).
func (m *MessageModel) MarkSeenConversation(ctx context.Context, viewerID, otherUserID int64) (seenUpToID int64, seenAt time.Time, err error) {
	if viewerID <= 0 || otherUserID <= 0 {
		return 0, time.Time{}, sql.ErrNoRows
	}

	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, time.Time{}, err
	}
	defer func() {
		// safe rollback
		_ = tx.Rollback()
	}()

	// Find the highest message id that will be marked.
	const maxQ = `
SELECT COALESCE(MAX(id), 0)
FROM messages
WHERE from_user_id = ?
  AND to_user_id = ?
  AND seen = 0;
`
	var maxID int64
	if err := tx.QueryRowContext(ctx, maxQ, otherUserID, viewerID).Scan(&maxID); err != nil {
		return 0, time.Time{}, err
	}

	if maxID == 0 {
		// Nothing to mark.
		if err := tx.Commit(); err != nil {
			return 0, time.Time{}, err
		}
		return 0, time.Time{}, nil
	}

	now := time.Now().UTC()

	// Mark all unseen messages in this direction.
	const upd = `
UPDATE messages
SET seen = 1,
    seen_at = ?
WHERE from_user_id = ?
  AND to_user_id = ?
  AND seen = 0;
`
	if _, err := tx.ExecContext(ctx, upd, now, otherUserID, viewerID); err != nil {
		return 0, time.Time{}, err
	}

	if err := tx.Commit(); err != nil {
		return 0, time.Time{}, err
	}

	return maxID, now, nil
}

// Optional helper to map "sql: no rows" to a nicer error if you ever want it.
// Not required, but sometimes useful.
var ErrNotAllowed = errors.New("not allowed")
