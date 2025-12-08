package httpserver

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"real-time-forum/internal/models"
	"real-time-forum/internal/ws"
)

type Server struct {
	db    *sql.DB
	hub   *ws.Hub
	users *models.UserModel
	posts *models.PostModel
}

func NewServer(db *sql.DB, hub *ws.Hub) *Server {
	return &Server{
		db:    db,
		hub:   hub,
		users: &models.UserModel{DB: db},
		posts: &models.PostModel{DB: db},
	}
}
func (s *Server) handleChatWS(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserIDFromContext(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	s.hub.HandleChat(w, r, userID)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
func (s *Server) handlePosts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// lista de posts (máx 100)
		posts, err := s.posts.List(r.Context(), 100)
		if err != nil {
			http.Error(w, "cannot load posts", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"posts": posts,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// static (frontend)
	mux.Handle("/", http.FileServer(http.Dir("./web")))

	// API
	mux.HandleFunc("/api/register", s.handleRegister)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/posts", s.handlePosts)

	// WebSocket
	mux.HandleFunc("/ws/chat", s.handleChatWS)

	// Aquí podrías envolver mux con middlewares (logging, cors, sesiones...)
	return s.withSessionMiddleware(mux)
}
