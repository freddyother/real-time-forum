// internal/models/post.go
package models

import (
	"context"
	"database/sql"
	"errors"
	"strings"
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
	ViewsCount     int64 `json:"views_count"`
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
	  p.views_count,

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
		&p.ViewsCount,
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
	  p.views_count,

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
			&p.ViewsCount,
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

// ListWithReactionsPage returns posts paginated with author + reactions info for viewer.
// Uses LIMIT/OFFSET and also returns hasMore.
func (m *PostModel) ListWithReactionsPage(ctx context.Context, limit, offset int64, viewerID int64) ([]Post, bool, error) {
	// Pedimos 1 extra para saber si hay más
	fetch := limit + 1

	const query = `
    SELECT
      p.id,
      p.user_id,
      p.title,
      p.content,
      p.category,
      p.created_at,
      u.nickname AS author,
	  p.views_count,

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
    LIMIT ? OFFSET ?;
  `

	rows, err := m.DB.QueryContext(ctx, query, viewerID, viewerID, fetch, offset)
	if err != nil {
		return nil, false, err
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
			&p.ViewsCount,
			&p.ReactionsCount,
			&iReactedInt,
		); err != nil {
			return nil, false, err
		}

		p.IReacted = iReactedInt == 1
		posts = append(posts, p)
	}

	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	hasMore := int64(len(posts)) > limit
	if hasMore {
		posts = posts[:limit] // cut -> extra
	}

	return posts, hasMore, nil
}
func (m *PostModel) RegisterView(ctx context.Context, postID, viewerID int64) (int64, error) {
	// If there is no user (not logged in), we do not count (to maintain ‘1 per user’)..
	if viewerID <= 0 {
		var count int64
		err := m.DB.QueryRowContext(ctx, `SELECT views_count FROM posts WHERE id=?`, postID).Scan(&count)
		return count, err
	}

	// 1) Single insert (if it already existed, does nothing)
	res, err := m.DB.ExecContext(ctx,
		`INSERT OR IGNORE INTO post_views(post_id, user_id) VALUES(?, ?)`,
		postID, viewerID,
	)
	if err != nil {
		return 0, err
	}

	rows, _ := res.RowsAffected()

	// 2) If inserted (first time), increase counter
	if rows > 0 {
		_, err = m.DB.ExecContext(ctx,
			`UPDATE posts SET views_count = views_count + 1 WHERE id=?`,
			postID,
		)
		if err != nil {
			return 0, err
		}
	}

	// 3) Returns current count
	var count int64
	err = m.DB.QueryRowContext(ctx, `SELECT views_count FROM posts WHERE id=?`, postID).Scan(&count)
	return count, err
}
func (m *PostModel) CountViews(ctx context.Context, postID int64) (int64, error) {
	var n int64
	err := m.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM post_views WHERE post_id=?`, postID).Scan(&n)
	return n, err
}

// UpdateByOwner updates ONLY provided fields, and ONLY if owner matches.
// Returns sql.ErrNoRows if not found or not owner.
func (m *PostModel) UpdateByOwner(ctx context.Context, postID, ownerID int64, title, content, category *string) error {
	setParts := []string{}
	args := []any{}

	if title != nil {
		t := strings.TrimSpace(*title)
		if t == "" {
			return errors.New("title cannot be empty")
		}
		setParts = append(setParts, "title = ?")
		args = append(args, t)
	}

	if content != nil {
		c := strings.TrimSpace(*content)
		if c == "" {
			return errors.New("content cannot be empty")
		}
		setParts = append(setParts, "content = ?")
		args = append(args, c)
	}

	if category != nil {
		setParts = append(setParts, "category = ?")
		args = append(args, strings.TrimSpace(*category))
	}

	if len(setParts) == 0 {
		return errors.New("no fields to update")
	}

	// Optional edited marker
	setParts = append(setParts, "edited_at = datetime('now')")

	args = append(args, postID, ownerID)

	q := `UPDATE posts SET ` + strings.Join(setParts, ", ") + ` WHERE id = ? AND user_id = ?`
	res, err := m.DB.ExecContext(ctx, q, args...)
	if err != nil {
		return err
	}

	aff, _ := res.RowsAffected()
	if aff == 0 {
		return sql.ErrNoRows
	}

	return nil
}
