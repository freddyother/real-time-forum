package httpserver

import (
	"context"
	"net/http"
)

type ctxKey string

const ctxUserID ctxKey = "userID"

func (s *Server) withSessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		if err == nil && cookie.Value != "" {
			if userID, err := s.getUserIDBySession(r.Context(), cookie.Value); err == nil {
				ctx := context.WithValue(r.Context(), ctxUserID, userID)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

func getUserIDFromContext(r *http.Request) (int64, bool) {
	v := r.Context().Value(ctxUserID)
	if v == nil {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}
