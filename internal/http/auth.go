package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"real-time-forum/internal/models"

	"github.com/google/uuid"
)

type registerRequest struct {
	Nickname  string `json:"nickname"`
	Age       int    `json:"age"`
	Gender    string `json:"gender"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"password"`
}

type loginRequest struct {
	Identifier string `json:"identifier"` // nickname o email
	Password   string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	u := &s.users // atajo, pero mejor usar s.users directamente

	user := &models.User{
		Nickname:  req.Nickname,
		Age:       req.Age,
		Gender:    req.Gender,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Email:     req.Email,
	}

	if err := s.users.Create(r.Context(), user, req.Password); err != nil {
		http.Error(w, "cannot create user", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"user": user,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	user, err := s.users.Authenticate(r.Context(), req.Identifier, req.Password)
	if err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	sessionID := uuid.NewString()
	if err := s.createSession(r.Context(), sessionID, user.ID); err != nil {
		http.Error(w, "cannot create session", http.StatusInternalServerError)
		return
	}

	cookie := &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		// Secure:   true, // si usas https
	}
	http.SetCookie(w, cookie)

	writeJSON(w, http.StatusOK, map[string]any{
		"user": user,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err == nil && cookie.Value != "" {
		_ = s.deleteSession(r.Context(), cookie.Value)
	}

	// Expirar cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	w.WriteHeader(http.StatusNoContent)
}

// --- Sesiones ---

func (s *Server) createSession(ctx context.Context, id string, userID int64) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id) VALUES (?, ?)`,
		id, userID,
	)
	return err
}

func (s *Server) deleteSession(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE id = ?`,
		id,
	)
	return err
}

func (s *Server) getUserIDBySession(ctx context.Context, id string) (int64, error) {
	var userID int64
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM sessions WHERE id = ?`,
		id,
	).Scan(&userID)
	if err != nil {
		return 0, err
	}
	return userID, nil
}
