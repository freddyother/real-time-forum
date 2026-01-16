package models

import "time"

type Message struct {
	ID         int64      `json:"id"`
	FromUserID int64      `json:"from_user_id"`
	ToUserID   int64      `json:"to_user_id"`
	Content    string     `json:"content"`
	SentAt     time.Time  `json:"sent_at"`
	Seen       bool       `json:"seen"`
	SeenAt     *time.Time `json:"seen_at,omitempty"`
}
