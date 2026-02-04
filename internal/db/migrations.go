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
	if strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
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
		`CREATE TABLE IF NOT EXISTS posts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			category TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);`,
		// Post View table
		`CREATE TABLE IF NOT EXISTS post_views (
  			post_id   INTEGER NOT NULL,
 		 	user_id   INTEGER NOT NULL,
  			viewed_at DATETIME NOT NULL DEFAULT (datetime('now')),
 			PRIMARY KEY (post_id, user_id),
  			FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
		// Reactions
		`CREATE TABLE IF NOT EXISTS post_reactions (
  			post_id INTEGER NOT NULL,
 			 user_id INTEGER NOT NULL,
 			 reaction TEXT NOT NULL DEFAULT 'like',
			 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 			 PRIMARY KEY (post_id, user_id, reaction),
 		 	FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
 			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,

		`CREATE INDEX IF NOT EXISTS idx_post_reactions_post
  			ON post_reactions(post_id);`,

		`CREATE INDEX IF NOT EXISTS idx_post_reactions_user
  			ON post_reactions(user_id);`,

		// Messages table: stores private messages exchanged between users.
		// "seen/delivered" columns are added via ALTER TABLE to stay idempotent.
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

		// Indices for messages listing.
		`CREATE INDEX IF NOT EXISTS idx_messages_pair_time
			ON messages(from_user_id, to_user_id, sent_at);`,

		`CREATE INDEX IF NOT EXISTS idx_messages_time
			ON messages(sent_at);`,
	}

	// 1) Create base tables/indexes first
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	// 2) Add delivery/seen columns (idempotent)
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE messages ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return err
	}
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE messages ADD COLUMN delivered_at DATETIME;`); err != nil {
		return err
	}
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE messages ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return err
	}
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE messages ADD COLUMN seen_at DATETIME;`); err != nil {
		return err
	}

	// 3) Helpful indices
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_delivered ON messages(to_user_id, delivered, sent_at);`); err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_to_seen ON messages(to_user_id, seen, sent_at);`); err != nil {
		return err
	}
	// adding columns
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE posts ADD COLUMN views_count INTEGER NOT NULL DEFAULT 0;`); err != nil {
		return err
	}
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE posts ADD COLUMN edited_at DATETIME;`); err != nil {
		return err
	}
	if err := execIgnoreDuplicateColumn(db, `ALTER TABLE comments ADD COLUMN edited_at DATETIME;`); err != nil {
		return err
	}

	// Optional: seed categories
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
