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
	SentAt     string `json:"sent_at"`           // RFC3339 for frontend
	Seen       bool   `json:"seen"`              // optional shortcut (or compute from seen_at)
	TempID     string `json:"temp_id,omitempty"` // optimistic UI reconciliation
}

// DeliveredEvent means "the recipient received it" (WS reached recipient).
type DeliveredEvent struct {
	Type        string `json:"type"` // "delivered"
	MessageID   int64  `json:"message_id"`
	FromUserID  int64  `json:"from_user_id"`
	ToUserID    int64  `json:"to_user_id"`
	DeliveredAt string `json:"delivered_at,omitempty"` // RFC3339 optional
}

// SeenEvent means "the recipient opened the conversation and saw messages".
type SeenEvent struct {
	Type       string `json:"type"`         // "seen"
	FromUserID int64  `json:"from_user_id"` // original sender
	ToUserID   int64  `json:"to_user_id"`   // viewer (who saw)
	SeenUpToID int64  `json:"seen_up_to_id,omitempty"`
	SeenAt     string `json:"seen_at,omitempty"` // RFC3339 optional
}

// Hub manages all active WebSocket clients and routes events between them.
type Hub struct {
	mu sync.RWMutex

	// clientsByUser groups clients by userID (supports multiple tabs).
	clientsByUser map[int64]map[*Client]bool

	register   chan *Client
	unregister chan *Client

	// broadcast is for chat messages (persisted and normalized).
	broadcast chan MessageEvent

	// OnMessage persists the message (DB) and returns the final event to broadcast.
	OnMessage func(ctx context.Context, in MessageEvent) (MessageEvent, error)

	// Optional: callbacks for receipts (you will wire these in server.NewServer later).
	OnDelivered func(ctx context.Context, receiverID, messageID int64) (fromUserID int64, deliveredAtRFC3339 string, err error)
	OnSeen      func(ctx context.Context, viewerID, otherUserID int64) (fromUserID int64, toUserID int64, seenUpToID int64, seenAtRFC3339 string, err error)
}

// NewHub creates a new Hub with initialized channels and storage.
func NewHub() *Hub {
	return &Hub{
		clientsByUser: make(map[int64]map[*Client]bool),
		register:      make(chan *Client),
		unregister:    make(chan *Client),
		broadcast:     make(chan MessageEvent, 256),
	}
}

// Run listens for register/unregister and broadcast events.
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

// sendToUser sends any WS event to all connected tabs for a given user.
func (h *Hub) sendToUser(userID int64, payload any) {
	h.mu.RLock()
	set := h.clientsByUser[userID]
	h.mu.RUnlock()
	if set == nil {
		return
	}

	for c := range set {
		select {
		case c.send <- payload:
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
