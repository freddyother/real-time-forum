package models

import (
	"context"
	"testing"

	appdb "real-time-forum/internal/db"
)

func TestAuthenticateMatchesNicknameCaseInsensitively(t *testing.T) {
	db, err := appdb.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		t.Fatal(err)
	}

	users := &UserModel{DB: db}
	user := &User{
		Nickname:  "Gus",
		Age:       28,
		Gender:    "other",
		FirstName: "Gus",
		LastName:  "Tester",
		Email:     "gus@example.com",
	}

	if err := users.Create(context.Background(), user, "password"); err != nil {
		t.Fatal(err)
	}

	got, err := users.Authenticate(context.Background(), "gUs", "password")
	if err != nil {
		t.Fatal(err)
	}

	if got.ID != user.ID {
		t.Fatalf("authenticated user id = %d, want %d", got.ID, user.ID)
	}
}
