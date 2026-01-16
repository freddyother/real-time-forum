// internal/ws/hub.go
package ws

import (
	"context"
	"sync"
)

// MessageEvent is the payload for chat messages.
type MessageEvent struct {
	Type       string `json:"type"` // "message"
	ID         int64  `json:"id,omitempty"`
	FromUserID int64  `json:"from_user_id"`
	ToUserID   int64  `json:"to_user_id"`
	Content    string `json:"content"`
	SentAt     string `json:"sent_at"`           // RFC3339 string for frontend
	Seen       bool   `json:"seen"`              // later
	TempID     string `json:"temp_id,omitempty"` // used to reconcile optimistic UI
}

// Hub manages all active WebSocket clients and routes messages between them.
type Hub struct {
	mu sync.RWMutex

	// clientsByUser groups clients by userID (supports multiple tabs).
	clientsByUser map[int64]map[*Client]bool

	register   chan *Client
	unregister chan *Client
	broadcast  chan MessageEvent

	// OnMessage persists the message (DB) and returns the final event to broadcast.
	OnMessage func(ctx context.Context, in MessageEvent) (MessageEvent, error)
}

func NewHub() *Hub {
	return &Hub{
		clientsByUser: make(map[int64]map[*Client]bool),
		register:      make(chan *Client),
		unregister:    make(chan *Client),
		broadcast:     make(chan MessageEvent, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			// Register a newly connected client.
			h.mu.Lock()
			if h.clientsByUser[c.userID] == nil {
				h.clientsByUser[c.userID] = make(map[*Client]bool)
			}
			h.clientsByUser[c.userID][c] = true
			h.mu.Unlock()

		case c := <-h.unregister:
			// Remove a disconnected client and close its channel.
			h.mu.Lock()
			if set, ok := h.clientsByUser[c.userID]; ok {
				delete(set, c)
				if len(set) == 0 {
					delete(h.clientsByUser, c.userID)
				}
			}
			h.mu.Unlock()

			// Close send channel AFTER removing from maps (safe for writePump range).
			close(c.send)

		case msg := <-h.broadcast:
			// Deliver message to sender and recipient (all tabs).
			h.sendToUser(msg.FromUserID, msg)
			if msg.ToUserID != msg.FromUserID {
				h.sendToUser(msg.ToUserID, msg)
			}
		}
	}
}

func (h *Hub) sendToUser(userID int64, msg MessageEvent) {
	h.mu.RLock()
	set := h.clientsByUser[userID]
	h.mu.RUnlock()
	if set == nil {
		return
	}

	for c := range set {
		select {
		case c.send <- msg:
		default:
			// If the client cannot receive, assume it's dead.
			h.mu.Lock()
			delete(set, c)
			if len(set) == 0 {
				delete(h.clientsByUser, userID)
			}
			h.mu.Unlock()
			close(c.send)
		}
	}
}
