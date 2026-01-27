package models

import (
	"context"
	"database/sql"
	"time"
)

// Post represents a forum post created by a user.
type Post struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	CreatedAt time.Time `json:"created_at"`
	Author    string    `json:"author"` // resolved from joined users table

	// Reactions (like for now)
	ReactionsCount int64 `json:"reactions_count"`
	IReacted       bool  `json:"i_reacted"`
}

// PostModel provides database operations for posts.
type PostModel struct {
	DB *sql.DB
}

// Get returns a post by ID, with the author's nickname.
func (m *PostModel) Get(ctx context.Context, id int64) (*Post, error) {
	const query = `
		SELECT
			p.id,
			p.user_id,
			p.title,
			p.content,
			p.category,
			p.created_at,
			u.nickname AS author
		FROM posts p
		JOIN users u ON u.id = p.user_id
		WHERE p.id = ?;
	`

	var p Post

	err := m.DB.QueryRowContext(ctx, query, id).Scan(
		&p.ID,
		&p.UserID,
		&p.Title,
		&p.Content,
		&p.Category,
		&p.CreatedAt,
		&p.Author,
	)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

// List returns a collection of posts ordered by creation date (newest first).
// The returned list size is limited by the provided limit value.
func (m *PostModel) List(ctx context.Context, limit int) ([]Post, error) {
	query := `
	SELECT p.id, p.user_id, p.title, p.content, p.category, p.created_at,
	       u.nickname as author
	FROM posts p
	JOIN users u ON u.id = p.user_id
	ORDER BY p.created_at DESC
	LIMIT ?`

	rows, err := m.DB.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var p Post

		// Map row data into the Post struct.
		if err := rows.Scan(
			&p.ID,
			&p.UserID,
			&p.Title,
			&p.Content,
			&p.Category,
			&p.CreatedAt,
			&p.Author,
		); err != nil {
			return nil, err
		}

		posts = append(posts, p)
	}

	// Return any scan or iteration error.
	return posts, rows.Err()
}

// Create inserts a new post for the given user into the database.
func (m *PostModel) Create(ctx context.Context, p *Post) error {
	query := `
		INSERT INTO posts (user_id, title, content, category)
		VALUES (?, ?, ?, ?)`

	res, err := m.DB.ExecContext(ctx, query,
		p.UserID, p.Title, p.Content, p.Category,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}

	p.ID = id

	// Load the created_at value from the database so the struct is complete.
	row := m.DB.QueryRowContext(ctx,
		`SELECT created_at FROM posts WHERE id = ?`, p.ID,
	)

	if err := row.Scan(&p.CreatedAt); err != nil {
		return err
	}

	return nil
}

// GetWithReactions returns a post by ID, with author + reactions info for viewer.
func (m *PostModel) GetWithReactions(ctx context.Context, id int64, viewerID int64) (*Post, error) {
	const query = `
    SELECT
      p.id,
      p.user_id,
      p.title,
      p.content,
      p.category,
      p.created_at,
      u.nickname AS author,

      -- total likes
      (SELECT COUNT(*) FROM post_reactions r
        WHERE r.post_id = p.id AND r.reaction = 'like'
      ) AS reactions_count,

      -- did viewer like it?
      CASE
        WHEN ? <= 0 THEN 0
        ELSE EXISTS(
          SELECT 1 FROM post_reactions r2
          WHERE r2.post_id = p.id AND r2.user_id = ? AND r2.reaction = 'like'
        )
      END AS i_reacted
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?;
  `

	var p Post
	var iReactedInt int // SQLite returns 0/1

	err := m.DB.QueryRowContext(ctx, query, viewerID, viewerID, id).Scan(
		&p.ID,
		&p.UserID,
		&p.Title,
		&p.Content,
		&p.Category,
		&p.CreatedAt,
		&p.Author,
		&p.ReactionsCount,
		&iReactedInt,
	)
	if err != nil {
		return nil, err
	}

	p.IReacted = iReactedInt == 1
	return &p, nil
}

// ListWithReactions returns posts with author + reactions info for viewer.
func (m *PostModel) ListWithReactions(ctx context.Context, limit int, viewerID int64) ([]Post, error) {
	const query = `
    SELECT
      p.id,
      p.user_id,
      p.title,
      p.content,
      p.category,
      p.created_at,
      u.nickname AS author,

      (SELECT COUNT(*) FROM post_reactions r
        WHERE r.post_id = p.id AND r.reaction = 'like'
      ) AS reactions_count,

      CASE
        WHEN ? <= 0 THEN 0
        ELSE EXISTS(
          SELECT 1 FROM post_reactions r2
          WHERE r2.post_id = p.id AND r2.user_id = ? AND r2.reaction = 'like'
        )
      END AS i_reacted
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT ?;
  `

	rows, err := m.DB.QueryContext(ctx, query, viewerID, viewerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	posts := []Post{}
	for rows.Next() {
		var p Post
		var iReactedInt int

		if err := rows.Scan(
			&p.ID,
			&p.UserID,
			&p.Title,
			&p.Content,
			&p.Category,
			&p.CreatedAt,
			&p.Author,
			&p.ReactionsCount,
			&iReactedInt,
		); err != nil {
			return nil, err
		}

		p.IReacted = iReactedInt == 1
		posts = append(posts, p)
	}

	return posts, rows.Err()
}
