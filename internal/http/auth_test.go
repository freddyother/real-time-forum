package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	appdb "real-time-forum/internal/db"
	"real-time-forum/internal/models"
	"real-time-forum/internal/ws"
)

func TestHandleCurrentUserRestoresSession(t *testing.T) {
	db, err := appdb.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		t.Fatal(err)
	}

	server := NewServer(db, ws.NewHub())
	user := &models.User{
		Nickname:  "session-user",
		Age:       30,
		Gender:    "other",
		FirstName: "Session",
		LastName:  "User",
		Email:     "session@example.com",
	}
	if err := server.users.Create(context.Background(), user, "password"); err != nil {
		t.Fatal(err)
	}
	if err := server.createSession(context.Background(), "test-session", user.ID); err != nil {
		t.Fatal(err)
	}

	handler := server.withSessionMiddleware(http.HandlerFunc(server.handleCurrentUser))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: "test-session"})
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%q", rec.Code, http.StatusOK, rec.Body.String())
	}

	var response struct {
		User models.User `json:"user"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response.User.ID != user.ID || response.User.Nickname != user.Nickname {
		t.Fatalf("restored user = %+v, want id=%d nickname=%q", response.User, user.ID, user.Nickname)
	}
}

func TestHandleCurrentUserRejectsMissingSession(t *testing.T) {
	db, err := appdb.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		t.Fatal(err)
	}

	server := NewServer(db, ws.NewHub())
	handler := server.withSessionMiddleware(http.HandlerFunc(server.handleCurrentUser))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestHandleCurrentUserRejectsExpiredSession(t *testing.T) {
	db, err := appdb.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := appdb.RunMigrations(db); err != nil {
		t.Fatal(err)
	}

	server := NewServer(db, ws.NewHub())
	user := &models.User{
		Nickname:  "expired-session-user",
		Age:       30,
		Gender:    "other",
		FirstName: "Expired",
		LastName:  "Session",
		Email:     "expired-session@example.com",
	}
	if err := server.users.Create(context.Background(), user, "password"); err != nil {
		t.Fatal(err)
	}
	if err := server.createSession(context.Background(), "expired-session", user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`, "expired-session"); err != nil {
		t.Fatal(err)
	}

	handler := server.withSessionMiddleware(http.HandlerFunc(server.handleCurrentUser))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.AddCookie(&http.Cookie{Name: "session_id", Value: "expired-session"})
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}
