package ws

import (
	"net/http/httptest"
	"testing"
)

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name   string
		host   string
		origin string
		want   bool
	}{
		{name: "missing origin", host: "forum.test", want: true},
		{name: "same HTTP origin", host: "forum.test", origin: "http://forum.test", want: true},
		{name: "same HTTPS origin", host: "forum.test:8443", origin: "https://forum.test:8443", want: true},
		{name: "different origin", host: "forum.test", origin: "https://attacker.test", want: false},
		{name: "invalid scheme", host: "forum.test", origin: "file://forum.test", want: false},
		{name: "invalid origin", host: "forum.test", origin: "://bad", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "http://"+tt.host+"/ws/chat", nil)
			req.Host = tt.host
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			if got := checkOrigin(req); got != tt.want {
				t.Fatalf("checkOrigin() = %v, want %v", got, tt.want)
			}
		})
	}
}
