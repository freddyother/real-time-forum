package models

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

var (
	ErrCategoryNotFound = errors.New("category not found")
	ErrCategoryLimit    = errors.New("category limit reached")
)

type Category struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type CategoryModel struct {
	DB *sql.DB
}

// normaliseName trims whitespace and applies a consistent case policy.
func normaliseName(name string) string {
	return strings.TrimSpace(name)
}

// Ensure returns an existing category by name or creates it if possible.
// It enforces a maximum number of categories (maxTotal).
func (m *CategoryModel) Ensure(ctx context.Context, rawName string, maxTotal int) (*Category, error) {
	name := normaliseName(rawName)
	if name == "" {
		return nil, errors.New("empty category name")
	}

	// 1) Try to find an existing category (case-insensitive).
	var cat Category
	err := m.DB.QueryRowContext(
		ctx,
		`SELECT id, name, created_at
		 FROM categories
		 WHERE LOWER(name) = LOWER(?)
		 LIMIT 1`,
		name,
	).Scan(&cat.ID, &cat.Name, &cat.CreatedAt)

	if err == nil {
		// Found existing category, simply return it.
		return &cat, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// 2) Category does not exist → check total count limit.
	var count int
	if err := m.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories`).Scan(&count); err != nil {
		return nil, err
	}

	if count >= maxTotal {
		return nil, ErrCategoryLimit
	}

	// 3) Insert new category.
	res, err := m.DB.ExecContext(
		ctx,
		`INSERT INTO categories (name) VALUES (?)`,
		name,
	)
	if err != nil {
		return nil, err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	cat = Category{
		ID:        id,
		Name:      name,
		CreatedAt: time.Now(),
	}
	return &cat, nil
}

// List returns all categories ordered by name.
func (m *CategoryModel) List(ctx context.Context) ([]Category, error) {
	rows, err := m.DB.QueryContext(ctx,
		`SELECT id, name, created_at
		 FROM categories
		 ORDER BY name ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, c)
	}
	return items, rows.Err()
}
