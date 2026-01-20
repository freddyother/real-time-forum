// internal/http/middleware.go
package httpserver

import (
	"context"
	"net/http"
)

type ctxKey string

// ctxUserID is the context key used to store the authenticated user's ID.
const ctxUserID ctxKey = "userID"

// withSessionMiddleware attaches the user ID to the request context
// if a valid session cookie is present. It allows downstream handlers
// to identify the authenticated user.
func (s *Server) withSessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		// Attempt to read the session cookie.
		cookie, err := r.Cookie("session_id")
		if err == nil && cookie.Value != "" {

			// Validate the session and retrieve the associated user ID.
			if userID, err := s.getUserIDBySession(r.Context(), cookie.Value); err == nil {

				// Attach the user ID to the request context.
				ctx := context.WithValue(r.Context(), ctxUserID, userID)
				r = r.WithContext(ctx)
			}
		}

		next.ServeHTTP(w, r)
	})
}

// getUserIDFromContext retrieves the user ID placed in the context
// by the session middleware. Returns false if no user is authenticated.
func getUserIDFromContext(r *http.Request) (int64, bool) {
	v := r.Context().Value(ctxUserID)
	if v == nil {
		return 0, false
	}

	id, ok := v.(int64)
	return id, ok
}
