// internal/models/comments.go
package models

import (
	"context"
	"database/sql"
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
