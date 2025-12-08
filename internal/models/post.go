package models

import (
	"context"
	"database/sql"
	"time"
)

type Post struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	CreatedAt time.Time `json:"created_at"`
	Author    string    `json:"author"`
}

type PostModel struct {
	DB *sql.DB
}

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
		if err := rows.Scan(&p.ID, &p.UserID, &p.Title, &p.Content, &p.Category, &p.CreatedAt, &p.Author); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}
