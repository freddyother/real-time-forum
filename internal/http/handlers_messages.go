// internal/http/handler_message.go
package httpserver

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
)

type sendMessageRequest struct {
	Content string `json:"content"`
}

// handleMessages routes:
//
//	GET  /api/messages/{otherUserId}?offset=0&limit=20
//	POST /api/messages/{otherUserId}
func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	// Auth required
	userID, ok := getUserIDFromContext(r)
	if !ok {
		http.Error(w, "unauthorised", http.StatusUnauthorized)
		return
	}

	// Extract otherUserId from path: "/api/messages/{id}"
	rest := strings.TrimPrefix(r.URL.Path, "/api/messages/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		http.Error(w, "missing user id", http.StatusBadRequest)
		return
	}

	otherID, err := strconv.ParseInt(rest, 10, 64)
	if err != nil || otherID <= 0 {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}
	if otherID == userID {
		http.Error(w, "cannot message yourself", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:

		limit := 10
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		if limit < 1 {
			limit = 1
		}
		if limit > 50 {
			limit = 50
		}

		var beforeID int64 = 0
		if v := r.URL.Query().Get("before"); v != "" {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
				beforeID = n
			}
		}
		log.Printf("[MESSAGES] GET other=%d limit=%d before=%d user=%d", otherID, limit, beforeID, userID)

		// Cursor pagination: model returns only "limit" messages + hasMore/nextBefore
		msgs, hasMore, nextBefore, err := s.messages.ListBetweenBefore(r.Context(), userID, otherID, limit, beforeID)
		if err != nil {
			log.Println("[MESSAGES] list error:", err)
			http.Error(w, "cannot load messages", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"messages":    msgs,
			"has_more":    hasMore,
			"next_before": nextBefore,
		})

	case http.MethodPost:
		var req sendMessageRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		msg, err := s.messages.Create(r.Context(), userID, otherID, req.Content)
		if err != nil {
			// Create() usa sql.ErrNoRows as signal "empty content "
			if err == sql.ErrNoRows {
				http.Error(w, "content is required", http.StatusBadRequest)
				return
			}
			log.Println("[MESSAGES] create error:", err)
			http.Error(w, "cannot create message", http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"message": msg,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
