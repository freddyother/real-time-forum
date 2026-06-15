// internal/ws/handler.go
package ws

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: checkOrigin,
}

func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Non-browser clients may omit Origin.
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}

	return strings.EqualFold(parsed.Host, r.Host)
}

// HandleChat upgrades the incoming request to a WebSocket connection
// and registers a new client within the Hub using the provided user ID.
func (h *Hub) HandleChat(w http.ResponseWriter, r *http.Request, userID int64) {

	// Attempt to establish a WebSocket connection.
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Log upgrade failures for debugging.
		log.Printf("[WS] Upgrade failed: %v", err)
		return
	}

	// Create a new client instance associated with this user.
	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan any, 256),

		userID: userID,
	}

	// Register the client with the Hub.
	h.register <- client

	// Start goroutines responsible for reading and writing messages.
	go client.writePump()
	go client.readPump()
}
