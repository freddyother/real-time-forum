package models

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	// Returned when no matching user record is found.
	ErrUserNotFound = errors.New("user not found")

	// Returned when the provided password does not match the stored hash.
	ErrInvalidPassword = errors.New("invalid password")
)

// User represents an account in the system.
type User struct {
	ID           int64     `json:"id"`
	UUID         string    `json:"uuid"`
	Nickname     string    `json:"nickname"`
	Age          int       `json:"age"`
	Gender       string    `json:"gender"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // never exposed in JSON
	CreatedAt    time.Time `json:"created_at"`
}

// UserLite is a lightweight user representation (chat, sidebar, lists)
type UserLite struct {
	ID       int64  `json:"id"`
	Nickname string `json:"nickname"`
}

// UserModel provides database operations for user management.
type UserModel struct {
	DB *sql.DB
}

// ------------------------------------------------------------
// Create
// ------------------------------------------------------------

// Create inserts a new user record with a securely hashed password.
func (m *UserModel) Create(ctx context.Context, u *User, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	u.PasswordHash = string(hash)
	u.UUID = uuid.NewString()

	query := `
	INSERT INTO users (uuid, nickname, age, gender, first_name, last_name, email, password_hash)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	res, err := m.DB.ExecContext(ctx, query,
		u.UUID, u.Nickname, u.Age, u.Gender, u.FirstName, u.LastName, u.Email, u.PasswordHash,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}

	u.ID = id
	return nil
}

// ------------------------------------------------------------
// Get / Auth
// ------------------------------------------------------------

// GetByIdentifier retrieves a user using either nickname or email.
func (m *UserModel) GetByIdentifier(ctx context.Context, identifier string) (*User, error) {
	query := `
	SELECT id, uuid, nickname, age, gender, first_name, last_name, email, password_hash, created_at
	FROM users
	WHERE nickname = ? OR email = ?
	LIMIT 1`

	row := m.DB.QueryRowContext(ctx, query, identifier, identifier)

	var u User
	err := row.Scan(
		&u.ID, &u.UUID, &u.Nickname, &u.Age, &u.Gender,
		&u.FirstName, &u.LastName, &u.Email, &u.PasswordHash, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	return &u, nil
}

// GetByID retrieves a user by id.
func (m *UserModel) GetByID(ctx context.Context, id int64) (*User, error) {
	query := `
	SELECT id, uuid, nickname, age, gender, first_name, last_name, email, password_hash, created_at
	FROM users
	WHERE id = ?
	LIMIT 1`

	row := m.DB.QueryRowContext(ctx, query, id)

	var u User
	err := row.Scan(
		&u.ID, &u.UUID, &u.Nickname, &u.Age, &u.Gender,
		&u.FirstName, &u.LastName, &u.Email, &u.PasswordHash, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	return &u, nil
}

// Authenticate validates a user by identifier and password.
func (m *UserModel) Authenticate(ctx context.Context, identifier, password string) (*User, error) {
	u, err := m.GetByIdentifier(ctx, identifier)
	if err != nil {
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidPassword
	}

	return u, nil
}

// ------------------------------------------------------------
// Chat helpers
// ------------------------------------------------------------

// ListOthers returns a list of users except the current one.
// Used for chat sidebar / user selection.
func (m *UserModel) ListOthers(ctx context.Context, currentUserID int64, limit int) ([]UserLite, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `
	SELECT id, nickname
	FROM users
	WHERE id != ?
	ORDER BY nickname ASC
	LIMIT ?`

	rows, err := m.DB.QueryContext(ctx, query, currentUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []UserLite
	for rows.Next() {
		var u UserLite
		if err := rows.Scan(&u.ID, &u.Nickname); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	return users, nil
}
