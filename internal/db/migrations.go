package db

import (
	"database/sql"
	"strings"
)

func execIgnoreDuplicateColumn(db *sql.DB, stmt string) error {
	_, err := db.Exec(stmt)
	if err == nil {
		return nil
	}
	// SQLite error message example: "duplicate column name: seen"
	if strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
		return nil
	}
	return err
}

// RunMigrations applies the database schema required by the application.
// Each statement is idempotent and safe to execute multiple times.
func RunMigrations(db *sql.DB) error {
	stmts := []string{
		// Users table: stores account information and credentials.
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			uuid TEXT NOT NULL UNIQUE,
			nickname TEXT NOT NULL UNIQUE,
			age INTEGER NOT NULL,
			gender TEXT NOT NULL,
			first_name TEXT NOT NULL,
			last_name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,

		// Categories table: central store for post categories.
		`CREATE TABLE IF NOT EXISTS categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,

		// Posts table: represents forum posts created by users.
		// For now we keep category as TEXT. It should match categories.name.
		`CREATE TABLE IF NOT EXISTS posts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			category TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,

		// Comments table: contains comments associated with posts.
		`CREATE TABLE IF NOT EXISTS comments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			post_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			content TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (post_id) REFERENCES posts(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,

		// Messages table: stores private messages exchanged between users.
		`CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			from_user_id INTEGER NOT NULL,
			to_user_id INTEGER NOT NULL,
			content TEXT NOT NULL,
			sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (from_user_id) REFERENCES users(id),
			FOREIGN KEY (to_user_id) REFERENCES users(id)
		);`,

		// Sessions table: lightweight session store for authenticated users.
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		// messages index
		`CREATE INDEX IF NOT EXISTS idx_messages_pair_time
			ON messages(from_user_id, to_user_id, sent_at);`,

		`CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(sent_at);`,
	}

	// --- Messages "seen" fields (idempotent on SQLite) ---
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE messages ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return err
	}

	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE messages ADD COLUMN seen_at DATETIME;`); err != nil {
		return err
	}
	// Fast lookup for unread messages for a given recipient.
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_seen ON messages(to_user_id, seen, sent_at);`); err != nil {
		return err
	}

	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	// Optional: seed a default set of categories (idempotent).
	seed := `
		INSERT OR IGNORE INTO categories (name) VALUES
			('General'),
			('Tech-support'),
			('Technology'),
			('Announcements'),
			('FAQ'),
			('Fashion'),
			('Travel'),
			('Marketplace'),
			('Gaming'),
			('Introductions'),
			('Go'),
			('JavaScript');`

	if _, err := db.Exec(seed); err != nil {
		return err
	}

	return nil
}
