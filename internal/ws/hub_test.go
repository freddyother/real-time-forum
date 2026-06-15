package ws

import (
	"testing"
	"time"
)

func TestHubIgnoresDuplicateUnregister(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	client := &Client{
		hub:    hub,
		send:   make(chan any, 4),
		userID: 42,
	}

	hub.register <- client
	waitForClientState(t, hub, client, true)

	hub.unregister <- client
	hub.unregister <- client
	waitForClientState(t, hub, client, false)

	hub.mu.RLock()
	onlineCount := hub.onlineCount[client.userID]
	hub.mu.RUnlock()

	if onlineCount != 0 {
		t.Fatalf("online count = %d, want 0", onlineCount)
	}
}

func TestClientRequestsUnregisterOnlyOnce(t *testing.T) {
	hub := NewHub()
	client := &Client{
		hub:    hub,
		send:   make(chan any, 1),
		userID: 7,
	}

	done := make(chan struct{})
	go func() {
		client.requestUnregister()
		client.requestUnregister()
		close(done)
	}()

	select {
	case got := <-hub.unregister:
		if got != client {
			t.Fatalf("unregistered client = %p, want %p", got, client)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for unregister request")
	}

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("duplicate unregister request blocked")
	}

	select {
	case <-hub.unregister:
		t.Fatal("received a duplicate unregister request")
	default:
	}
}

func waitForClientState(t *testing.T, hub *Hub, client *Client, registered bool) {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		hub.mu.RLock()
		_, exists := hub.clientsByUser[client.userID][client]
		hub.mu.RUnlock()

		if exists == registered {
			return
		}
		time.Sleep(time.Millisecond)
	}

	t.Fatalf("client registered = %v, want %v", !registered, registered)
}
