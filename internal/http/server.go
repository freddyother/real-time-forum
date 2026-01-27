// internal/httpserver/server.go
package httpserver

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
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
	comments   *models.CommentModel
	messages   *models.MessageModel
}

// createPostRequest represents the JSON payload used to create a new post.
type createPostRequest struct {
	Title    string `json:"title"`
	Content  string `json:"content"`
	Category string `json:"category"`
}

// NewServer creates a new Server instance with all required components.
func NewServer(db *sql.DB, hub *ws.Hub) *Server {
	s := &Server{
		db:         db,
		hub:        hub,
		users:      &models.UserModel{DB: db},
		posts:      &models.PostModel{DB: db},
		categories: &models.CategoryModel{DB: db},
		comments:   &models.CommentModel{DB: db},
		messages:   &models.MessageModel{DB: db},
	}

	// Wire WS persistence (save to DB before broadcast).
	hub.OnMessage = func(ctx context.Context, in ws.MessageEvent) (ws.MessageEvent, error) {
		// Save the message in DB and return the persisted message.
		msg, err := s.messages.Create(ctx, in.FromUserID, in.ToUserID, in.Content)
		if err != nil {
			return in, err
		}

		in.ID = msg.ID
		in.SentAt = msg.SentAt.UTC().Format(time.RFC3339)
		in.Seen = false
		return in, nil
	}
	// 1) DELIVERED: recipient acks, we persist and notify sender
	hub.OnDelivered = func(ctx context.Context, receiverID, messageID int64) (int64, string, error) {
		// Debe:
		// - validar que receiverID es el to_user_id de ese messageID
		// - set delivered=1, delivered_at=NOW
		// - devolver from_user_id (para avisar al sender)
		fromUserID, deliveredAt, err := s.messages.MarkDelivered(ctx, receiverID, messageID)
		if err != nil {
			return 0, "", err
		}
		return fromUserID, deliveredAt.UTC().Format(time.RFC3339), nil
	}

	// 2) SEEN: viewer opens chat, we persist and notify sender with seen_up_to_id
	hub.OnSeen = func(ctx context.Context, viewerID, otherUserID int64) (int64, int64, int64, string, error) {
		// Debe:
		// - marcar seen=1, seen_at=NOW para mensajes: from=otherUserID AND to=viewerID AND seen=0
		// - devolver seenUpToID (max id marcado)
		seenUpToID, seenAt, err := s.messages.MarkSeenConversation(ctx, viewerID, otherUserID)
		if err != nil {
			return 0, 0, 0, "", err
		}
		// fromUserID = otherUserID (sender original), toUserID = viewerID (quien vio)
		return otherUserID, viewerID, seenUpToID, seenAt.UTC().Format(time.RFC3339), nil
	}
	// offline-Online
	hub.OnOffline = func(ctx context.Context, userID int64) (string, error) {
		now := time.Now().UTC()
		if err := s.users.UpdateLastSeen(ctx, userID, now); err != nil {
			return "", err
		}
		return now.Format(time.RFC3339), nil
	}

	return s
}

/*
------------------------------------------------------------
// handleChatWS upgrades the request to a WebSocket connection
// and links the client to the Hub using the authenticated user ID.
----------------------------------------------------------------------
*/
func (s *Server) handleChatWS(w http.ResponseWriter, r *http.Request) {

	// Log incoming WS attempts.
	log.Printf("[WS] Incoming %s %s from=%s", r.Method, r.URL.Path, r.RemoteAddr)

	// Only allow GET requests for WebSocket upgrade.
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// User must be authenticated (set by withSessionMiddleware).
	userID, ok := getUserIDFromContext(r)
	if !ok {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}

	// Upgrade the connection and register the client in the hub.
	s.hub.HandleChat(w, r, userID)
}

// writeJSON sends a JSON-encoded response with a given status code.
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// -------------------------------------------------------------------------------------------------------------------
//	handlePosts function (list/create posts)
// -------------------------------------------------------------------------------------------------------------------

// handlePosts routes GET and POST requests for forum posts.
func (s *Server) handlePosts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// ✅ viewerID optional (0 if no session)
		viewerID, _ := getUserIDFromContext(r)

		// ✅ List posts with reactions info
		posts, err := s.posts.ListWithReactions(r.Context(), 100, viewerID)
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

// -------------------------------------------------------------------------------------------------------------------
//	Single post + comments
// -------------------------------------------------------------------------------------------------------------------

// handlePostDetail decide si la ruta es /api/posts/{id} o /api/posts/{id}/comments
func (s *Server) handlePostDetail(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/comments") {
		s.handlePostComments(w, r)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/reactions") {
		s.handlePostReactions(w, r)
		return
	}
	s.handlePostByID(w, r)
}

// handlePostByID handle GET /api/posts/{id}
// Devuelve { "post": {...}, "comments": [...] }
func (s *Server) handlePostByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// extraer ID de /api/posts/{id}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/posts/")
	if idStr == "" {
		http.Error(w, "missing post id", http.StatusBadRequest)
		return
	}
	// in case there are sub-routes
	if idx := strings.IndexRune(idStr, '/'); idx != -1 {
		idStr = idStr[:idx]
	}

	postID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || postID <= 0 {
		http.Error(w, "invalid post id", http.StatusBadRequest)
		return
	}

	// ✅ viewerID optional (0 if no session)
	viewerID, _ := getUserIDFromContext(r)

	// ✅ Get post with reactions info
	post, err := s.posts.GetWithReactions(r.Context(), postID, viewerID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "post not found", http.StatusNotFound)
			return
		}
		log.Println("[POST] Get error:", err)
		http.Error(w, "cannot load post", http.StatusInternalServerError)
		return
	}

	comments, err := s.comments.ListByPost(r.Context(), postID)
	if err != nil {
		log.Println("[POST] Comments error:", err)
		http.Error(w, "cannot load comments", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"post":     post,
		"comments": comments,
	})
}

// ------------------------------------------------------------
//                      HandlePostreactions
// ------------------------------------------------------------

func (s *Server) handlePostReactions(w http.ResponseWriter, r *http.Request) {
	// /api/posts/{id}/reactions
	path := strings.TrimPrefix(r.URL.Path, "/api/posts/")
	path = strings.TrimSuffix(path, "/reactions")

	postID, err := strconv.ParseInt(path, 10, 64)
	if err != nil || postID <= 0 {
		http.Error(w, "invalid post id", http.StatusBadRequest)
		return
	}

	// optional payload: { "reaction": "like" }
	reaction := "like"
	if r.Method == http.MethodPost {
		var req struct {
			Reaction string `json:"reaction"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if strings.TrimSpace(req.Reaction) != "" {
			reaction = strings.TrimSpace(req.Reaction)
		}
	}

	switch r.Method {
	case http.MethodGet:
		// If logged in we can also return i_reacted
		userID, _ := getUserIDFromContext(r)

		count, iReacted, err := s.getReactionInfo(r.Context(), postID, userID, reaction)
		if err != nil {
			log.Println("[REACTIONS] Get error:", err)
			http.Error(w, "cannot load reactions", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"post_id":         postID,
			"reaction":        reaction,
			"reactions_count": count,
			"i_reacted":       iReacted,
		})

	case http.MethodPost:
		userID, ok := getUserIDFromContext(r)
		if !ok {
			http.Error(w, "unauthorised", http.StatusUnauthorized)
			return
		}

		reacted, count, err := s.toggleReaction(r.Context(), postID, userID, reaction)
		if err != nil {
			log.Println("[REACTIONS] Toggle error:", err)
			http.Error(w, "cannot react", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"post_id":         postID,
			"reaction":        reaction,
			"reacted":         reacted,
			"reactions_count": count,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) toggleReaction(ctx context.Context, postID, userID int64, reaction string) (bool, int64, error) {
	// 1) try delete (if existed)
	delRes, err := s.db.ExecContext(ctx,
		`DELETE FROM post_reactions WHERE post_id=? AND user_id=? AND reaction=?`,
		postID, userID, reaction,
	)
	if err != nil {
		return false, 0, err
	}

	rows, _ := delRes.RowsAffected()
	reactedNow := false

	// 2) if nothing deleted -> insert
	if rows == 0 {
		_, err := s.db.ExecContext(ctx,
			`INSERT INTO post_reactions(post_id, user_id, reaction) VALUES(?,?,?)`,
			postID, userID, reaction,
		)
		if err != nil {
			return false, 0, err
		}
		reactedNow = true
	}

	// 3) count
	var count int64
	err = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM post_reactions WHERE post_id=? AND reaction=?`,
		postID, reaction,
	).Scan(&count)
	if err != nil {
		return reactedNow, 0, err
	}

	return reactedNow, count, nil
}

func (s *Server) getReactionInfo(ctx context.Context, postID, userID int64, reaction string) (count int64, iReacted bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM post_reactions WHERE post_id=? AND reaction=?`,
		postID, reaction,
	).Scan(&count)
	if err != nil {
		return 0, false, err
	}

	if userID <= 0 {
		return count, false, nil
	}

	var exists int
	err = s.db.QueryRowContext(ctx,
		`SELECT EXISTS(
      SELECT 1 FROM post_reactions WHERE post_id=? AND user_id=? AND reaction=?
    )`,
		postID, userID, reaction,
	).Scan(&exists)
	if err != nil {
		return count, false, err
	}

	return count, exists == 1, nil
}

// handlePostComments handle:
//
//	GET  /api/posts/{id}/comments  -> list comments
//	POST /api/posts/{id}/comments  -> create comment
func (s *Server) handlePostComments(w http.ResponseWriter, r *http.Request) {
	// r.URL.Path: /api/posts/{id}/comments
	path := strings.TrimPrefix(r.URL.Path, "/api/posts/")
	path = strings.TrimSuffix(path, "/comments")

	postID, err := strconv.ParseInt(path, 10, 64)
	if err != nil || postID <= 0 {
		http.Error(w, "invalid post id", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		comments, err := s.comments.ListByPost(r.Context(), postID)
		if err != nil {
			log.Println("[COMMENTS] List error:", err)
			http.Error(w, "cannot load comments", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"comments": comments,
		})

	case http.MethodPost:
		userID, ok := getUserIDFromContext(r)
		if !ok {
			http.Error(w, "unauthorised", http.StatusUnauthorized)
			return
		}

		var req struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		req.Content = strings.TrimSpace(req.Content)
		if req.Content == "" {
			http.Error(w, "content is required", http.StatusBadRequest)
			return
		}

		comment := &models.Comment{
			PostID:  postID,
			UserID:  userID,
			Content: req.Content,
		}

		if err := s.comments.Create(r.Context(), comment); err != nil {
			log.Println("[COMMENTS] Create error:", err)
			http.Error(w, "cannot create comment", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"comment": comment,
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

	// List / create posts
	mux.HandleFunc("/api/posts", s.handlePosts)
	// Detail post + comments
	mux.HandleFunc("/api/posts/", s.handlePostDetail)

	// WebSocket endpoint.
	mux.HandleFunc("/ws/chat", s.handleChatWS)

	// handle messages
	mux.HandleFunc("/api/messages/", s.handleMessages)
	// handle users
	mux.HandleFunc("/api/users", s.handleUsers)

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

// Hijack passes through the http.Hijacker interface (required for WebSockets).
func (lrw *loggingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hj, ok := lrw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijacker not supported")
	}
	return hj.Hijack()
}

// Flush passes through the http.Flusher interface (nice for streaming).
func (lrw *loggingResponseWriter) Flush() {
	if f, ok := lrw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
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
