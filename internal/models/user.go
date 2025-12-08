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
	ErrUserNotFound    = errors.New("user not found")
	ErrInvalidPassword = errors.New("invalid password")
)

type User struct {
	ID           int64     `json:"id"`
	UUID         string    `json:"uuid"`
	Nickname     string    `json:"nickname"`
	Age          int       `json:"age"`
	Gender       string    `json:"gender"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type UserModel struct {
	DB *sql.DB
}

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

func (m *UserModel) GetByIdentifier(ctx context.Context, identifier string) (*User, error) {
	// identifier puede ser nickname o email
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
