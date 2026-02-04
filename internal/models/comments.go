// internal/models/comments.go
package models

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

type Comment struct {
	ID        int64  `json:"id"`
	PostID    int64  `json:"post_id"`
	UserID    int64  `json:"user_id"`
	Author    string `json:"author"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

type CommentModel struct {
	DB *sql.DB
}

// ListByPost returns all comments on a post (with the author's nickname).
func (m *CommentModel) ListByPost(ctx context.Context, postID int64) ([]*Comment, error) {
	const query = `
		SELECT
			c.id,
			c.post_id,
			c.user_id,
			u.nickname AS author,
			c.content,
			c.created_at
		FROM comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.post_id = ?
		ORDER BY c.created_at ASC;
	`

	rows, err := m.DB.QueryContext(ctx, query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*Comment

	for rows.Next() {
		var c Comment
		if err := rows.Scan(
			&c.ID,
			&c.PostID,
			&c.UserID,
			&c.Author,
			&c.Content,
			&c.CreatedAt,
		); err != nil {
			return nil, err
		}
		comments = append(comments, &c)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return comments, nil
}

// Create inserts a new comment and fills in ID, CreatedAt, and Author.
func (m *CommentModel) Create(ctx context.Context, c *Comment) error {
	res, err := m.DB.ExecContext(ctx,
		`INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`,
		c.PostID,
		c.UserID,
		c.Content,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err == nil {
		c.ID = id
	}

	// Retrieve the author’s created_at and nickname
	row := m.DB.QueryRowContext(ctx, `
		SELECT c.created_at, u.nickname
		FROM comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.id = ?;
	`, c.ID)

	_ = row.Scan(&c.CreatedAt, &c.Author)

	return nil
}

func (m *CommentModel) GetByID(ctx context.Context, commentID int64) (*Comment, error) {
	const q = `
    SELECT c.id, c.post_id, c.user_id, u.nickname AS author, c.content, c.created_at
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = ?;
  `
	var c Comment
	if err := m.DB.QueryRowContext(ctx, q, commentID).Scan(
		&c.ID, &c.PostID, &c.UserID, &c.Author, &c.Content, &c.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &c, nil
}
func (m *CommentModel) UpdateByOwner(ctx context.Context, commentID, ownerID int64, content string) (*Comment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("content is required")
	}

	// Si NO tienes edited_at en DB, quita esa parte del SET.
	res, err := m.DB.ExecContext(ctx, `
		UPDATE comments
		SET content = ?
		WHERE id = ? AND user_id = ?;
	`, content, commentID, ownerID)
	if err != nil {
		return nil, err
	}

	aff, _ := res.RowsAffected()
	if aff == 0 {
		return nil, sql.ErrNoRows // not found or not owner
	}

	// Return updated comment with author
	var c Comment
	err = m.DB.QueryRowContext(ctx, `
		SELECT
			c.id, c.post_id, c.user_id,
			u.nickname AS author,
			c.content, c.created_at
		FROM comments c
		JOIN users u ON u.id = c.user_id
		WHERE c.id = ?;
	`, commentID).Scan(&c.ID, &c.PostID, &c.UserID, &c.Author, &c.Content, &c.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &c, nil
}
