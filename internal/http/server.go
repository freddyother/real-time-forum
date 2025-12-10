package httpserver

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"real-time-forum/internal/models"
	"real-time-forum/internal/ws"
)

// Server holds shared application dependencies.
type Server struct {
	db    *sql.DB
	hub   *ws.Hub
	users *models.UserModel
	posts *models.PostModel
}

// NewServer creates a new Server instance with all required components.
func NewServer(db *sql.DB, hub *ws.Hub) *Server {
	return &Server{
		db:    db,
		hub:   hub,
		users: &models.UserModel{DB: db},
		posts: &models.PostModel{DB: db},
	}
}

// handleChatWS upgrades the request to a WebSocket connection
// and links the client to the Hub using the authenticated user ID.
func (s *Server) handleChatWS(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserIDFromContext(r)
	if !ok {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}
	s.hub.HandleChat(w, r, userID)
}

// writeJSON sends a JSON-encoded response with a given status code.
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// handlePosts responds to requests related to forum posts.
// Currently supports listing posts with GET.
func (s *Server) handlePosts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
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

// Router configures and returns the main HTTP handler.
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// Frontend assets
	mux.Handle("/", http.FileServer(http.Dir("./web")))

	// API routes
	mux.HandleFunc("/api/register", s.handleRegister)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/posts", s.handlePosts)

	// WebSocket endpoint
	mux.HandleFunc("/ws/chat", s.handleChatWS)

	// Wrap with session middleware and logging middleware.
	handler := s.withSessionMiddleware(mux)
	return loggingMiddleware(handler)
}

// loggingResponseWriter wraps http.ResponseWriter to capture status code.
type loggingResponseWriter struct {
	http.ResponseWriter
	status int
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.status = code
	lrw.ResponseWriter.WriteHeader(code)
}

// loggingMiddleware logs method, path, status and duration for each request.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		lrw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lrw, r)

		duration := time.Since(start)
		log.Printf("[HTTP] %s %s -> %d (%s)\n", r.Method, r.URL.Path, lrw.status, duration)
	})
}
