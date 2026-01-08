package httpserver

import (
	"log"
	"net/http"
	"strconv"

	"real-time-forum/internal/models"
)

// GET /api/users?limit=50
func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserIDFromContext(r)
	if !ok {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	users, err := s.users.ListOthers(r.Context(), userID, limit)
	if err != nil {
		log.Println("[USERS] list error:", err)
		http.Error(w, "cannot load users", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"users": users,
	})
}

// (optional) later to return 404 when no users
var _ = models.UserLite{}
