package httpserver

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"real-time-forum/internal/models"
	"real-time-forum/internal/ws"
)

// Server holds shared application dependencies.
type Server struct {
	db         *sql.DB
	hub        *ws.Hub
	users      *models.UserModel
	posts      *models.PostModel
	categories *models.CategoryModel
}

// createPostRequest represents the JSON payload used to create a new post.
type createPostRequest struct {
	Title    string `json:"title"`
	Content  string `json:"content"`
	Category string `json:"category"`
}

// NewServer creates a new Server instance with all required components.
func NewServer(db *sql.DB, hub *ws.Hub) *Server {
	return &Server{
		db:         db,
		hub:        hub,
		users:      &models.UserModel{DB: db},
		posts:      &models.PostModel{DB: db},
		categories: &models.CategoryModel{DB: db},
	}
}

/*
------------------------------------------------------------
// handleChatWS upgrades the request to a WebSocket connection
// and links the client to the Hub using the authenticated user ID.
----------------------------------------------------------------------
*/
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

// -------------------------------------------------------------------------------------------------------------------
//	handlePosts function
// -------------------------------------------------------------------------------------------------------------------

// handlePosts routes GET and POST requests for forum posts.
func (s *Server) handlePosts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// List the latest posts (up to 100).
		posts, err := s.posts.List(r.Context(), 100)
		if err != nil {
			log.Println("[POSTS] Error loading posts:", err)
			http.Error(w, "cannot load posts", http.StatusInternalServerError)
			return
		}

		log.Printf("[POSTS] Returned %d posts\n", len(posts))

		writeJSON(w, http.StatusOK, map[string]any{
			"posts": posts,
		})

	case http.MethodPost:
		// Only authenticated users can create posts.
		userID, ok := getUserIDFromContext(r)
		if !ok {
			http.Error(w, "unauthorised", http.StatusUnauthorized)
			return
		}

		var req createPostRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		if req.Title == "" || req.Content == "" {
			http.Error(w, "title and content are required", http.StatusBadRequest)
			return
		}

		// If the frontend did not send a category, fall back to "General".
		if req.Category == "" {
			req.Category = "General"
		}

		// Ensure the category exists in the categories table.
		// This call will:
		//   - Reuse an existing category if it already exists (case-insensitive)
		//   - Create a new one if there is still room
		//   - Enforce a hard limit of 30 categories
		const maxCategories = 30

		cat, err := s.categories.Ensure(r.Context(), req.Category, maxCategories)
		if err != nil {
			if errors.Is(err, models.ErrCategoryLimit) {
				log.Println("[POSTS] Category limit reached")
				http.Error(w, "category limit reached (30)", http.StatusBadRequest)
				return
			}
			log.Println("[POSTS] Error ensuring category:", err)
			http.Error(w, "cannot use category", http.StatusInternalServerError)
			return
		}

		post := &models.Post{
			UserID:   userID,
			Title:    req.Title,
			Content:  req.Content,
			Category: cat.Name, // use normalised category name from DB
		}

		if err := s.posts.Create(r.Context(), post); err != nil {
			log.Println("[POSTS] Error creating post:", err)
			http.Error(w, "cannot create post", http.StatusInternalServerError)
			return
		}

		log.Printf("[POSTS] Created post id=%d by user=%d in category=%q\n", post.ID, userID, post.Category)

		writeJSON(w, http.StatusCreated, map[string]any{
			"post": post,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// Router configures and returns the main HTTP handler.
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// Frontend assets.
	mux.Handle("/", http.FileServer(http.Dir("./web")))

	// API routes.
	mux.HandleFunc("/api/register", s.handleRegister)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/posts", s.handlePosts)

	// WebSocket endpoint.
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
