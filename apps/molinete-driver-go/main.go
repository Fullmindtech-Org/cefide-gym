// Molinete Driver / GymProxy — DCM PCA150 (Go)
//
// Corre en la PC del gym. Expone HTTP en localhost:3001 (exento de
// mixed-content HTTPS→HTTP). El navegador llama:
//
//   POST /proxy/<molinete>/abrir    → abre ese molinete
//   GET  /proxy/<molinete>/estado   → estado de ese molinete
//   GET  /status                    → health check de todos los targets
//
// Cada target se configura en config.json -> "targets":
//
//   "proxy"   El molinete es un dispositivo de RED con IP. El driver
//             reenvía el POST a la ESP según "target_url".
//
//   "serial"  El molinete se controla por CABLE (placa PCA150 por COM).
//             El driver manda el pulso por el puerto serie:
//               HAB1 → 0x01 (activar) / 0x00 (liberar)
//               HAB2 → 0x02 (activar) / 0x00 (liberar)
//             9600 8N1, pulso de pulse_ms.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"
)

// TargetConfig describes one molinete endpoint.
type TargetConfig struct {
	Mode      string `json:"mode"`       // "proxy" | "serial"
	TargetURL string `json:"target_url"` // proxy mode: URL of the ESP
	ComPort   string `json:"com_port"`   // serial mode
	PulseMs   int    `json:"pulse_ms"`
	Pin       string `json:"pin"` // HAB1 | HAB2

	mu      sync.Mutex
	simMode bool
}

type Config struct {
	HTTPPort    int                      `json:"http_port"`
	AllowOrigin string                   `json:"allow_origin"`
	TimeoutMs   int                      `json:"timeout_ms"`
	Secret      string                   `json:"secret"` // X-Driver-Secret (C1)
	Targets     map[string]*TargetConfig `json:"targets"`

	// Backward-compat single-target fields (used only if Targets is absent)
	Mode    string `json:"mode"`
	Target  string `json:"target"`
	ComPort string `json:"com_port"`
	PulseMs int    `json:"pulse_ms"`
	Pin     string `json:"pin"`
}

var (
	cfg     Config
	targets map[string]*TargetConfig
)

var pinActivate = map[string]byte{"HAB1": 0x01, "HAB2": 0x02}

const pinRelease byte = 0x00

// ── config ───────────────────────────────────────────────────

func loadConfig() Config {
	c := Config{
		HTTPPort: 3001, AllowOrigin: "*", TimeoutMs: 5000,
		Mode: "proxy", ComPort: "COM1", PulseMs: 500, Pin: "HAB1",
	}
	exe, _ := os.Executable()
	path := filepath.Join(filepath.Dir(exe), "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("[WARN] config.json no encontrado (%s) — usando defaults", path)
		return c
	}
	// Strip UTF-8 BOM (Notepad/PowerShell en Windows)
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	if err := json.Unmarshal(data, &c); err != nil {
		log.Fatalf("[FATAL] config.json inválido: %v", err)
	}
	return c
}

func resolveTargets(c Config) map[string]*TargetConfig {
	if len(c.Targets) > 0 {
		for name, t := range c.Targets {
			if t.Mode == "" {
				t.Mode = "proxy"
			}
			if t.PulseMs == 0 {
				t.PulseMs = 500
			}
			if t.Pin == "" {
				t.Pin = "HAB1"
			}
			if t.ComPort == "" {
				t.ComPort = "COM1"
			}
			log.Printf("[CONFIG] target %q: mode=%s", name, t.Mode)
		}
		return c.Targets
	}
	// Backward compat: wrap legacy single-target fields as "molinete1"
	log.Printf("[CONFIG] usando campos legacy (sin 'targets'); target=molinete1")
	t := &TargetConfig{
		Mode:      c.Mode,
		TargetURL: c.Target,
		ComPort:   c.ComPort,
		PulseMs:   c.PulseMs,
		Pin:       c.Pin,
	}
	if t.Mode == "" {
		t.Mode = "proxy"
	}
	if t.PulseMs == 0 {
		t.PulseMs = 500
	}
	if t.Pin == "" {
		t.Pin = "HAB1"
	}
	return map[string]*TargetConfig{"molinete1": t}
}

func initSerialTargets() {
	for name, t := range targets {
		if t.Mode != "serial" {
			continue
		}
		mode := &serial.Mode{BaudRate: 9600, DataBits: 8, Parity: serial.NoParity, StopBits: serial.OneStopBit}
		p, err := serial.Open(t.ComPort, mode)
		if err != nil {
			log.Printf("[WARN] target %q: no se pudo abrir %s (%v) — modo simulación activo", name, t.ComPort, err)
			t.simMode = true
		} else {
			p.Close()
		}
	}
}

// ── acciones ─────────────────────────────────────────────────

func abrirTarget(t *TargetConfig) (map[string]any, int) {
	if t.Mode == "serial" {
		if err := abrirSerial(t); err != nil {
			return map[string]any{"ok": false, "error": err.Error()}, http.StatusInternalServerError
		}
		return map[string]any{"ok": true, "mode": "serial", "pin": t.Pin, "comPort": t.ComPort}, http.StatusOK
	}
	return abrirProxy(t)
}

func abrirSerial(t *TargetConfig) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	activate, ok := pinActivate[t.Pin]
	if !ok {
		log.Printf("[WARN] pin desconocido %q — usando HAB1", t.Pin)
		activate = pinActivate["HAB1"]
	}
	if t.simMode {
		log.Printf("[SIM] pulso %dms en %s (%s) — simulado", t.PulseMs, t.Pin, t.ComPort)
		time.Sleep(time.Duration(t.PulseMs) * time.Millisecond)
		return nil
	}
	mode := &serial.Mode{BaudRate: 9600, DataBits: 8, Parity: serial.NoParity, StopBits: serial.OneStopBit}
	port, err := serial.Open(t.ComPort, mode)
	if err != nil {
		return err
	}
	defer port.Close()
	if _, err := port.Write([]byte{activate}); err != nil {
		return err
	}
	time.Sleep(time.Duration(t.PulseMs) * time.Millisecond)
	if _, err := port.Write([]byte{pinRelease}); err != nil {
		return err
	}
	return nil
}

func abrirProxy(t *TargetConfig) (map[string]any, int) {
	if t.TargetURL == "" {
		return map[string]any{"ok": false, "error": "target_url vacío en config"}, http.StatusInternalServerError
	}
	req, err := http.NewRequest(http.MethodPost, t.TargetURL, nil)
	if err != nil {
		return map[string]any{"ok": false, "error": err.Error()}, http.StatusInternalServerError
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: time.Duration(cfg.TimeoutMs) * time.Millisecond}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[ERROR] proxy → %s: %v", t.TargetURL, err)
		return map[string]any{"ok": false, "error": err.Error()}, http.StatusBadGateway
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("[OK] proxy → %s (HTTP %d)", t.TargetURL, resp.StatusCode)
	var parsed map[string]any
	if json.Unmarshal(respBody, &parsed) == nil {
		return parsed, http.StatusOK
	}
	return map[string]any{"ok": true}, http.StatusOK
}

func estadoTarget(t *TargetConfig) map[string]any {
	if t.Mode == "serial" {
		return map[string]any{
			"ok": true, "mode": "serial",
			"comPort": t.ComPort, "pulseMs": t.PulseMs,
			"pin": t.Pin, "simMode": t.simMode,
		}
	}
	reachable := false
	if t.TargetURL != "" {
		client := &http.Client{Timeout: 2 * time.Second}
		if resp, err := client.Head(t.TargetURL); err == nil {
			resp.Body.Close()
			reachable = true
		} else if resp, err := client.Get(t.TargetURL); err == nil {
			resp.Body.Close()
			reachable = true
		}
	}
	return map[string]any{"ok": true, "mode": "proxy", "targetURL": t.TargetURL, "reachable": reachable}
}

// ── HTTP ─────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", cfg.AllowOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Driver-Secret")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

// withSecret validates the X-Driver-Secret header (C1).
// If Secret is empty, logs a warning but allows the request.
func withSecret(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Secret == "" {
			log.Printf("[WARN] secret no configurado — endpoint desprotegido")
		} else if r.Header.Get("X-Driver-Secret") != cfg.Secret {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// handleProxy dispatches /proxy/<name>/<action>
func handleProxy(w http.ResponseWriter, r *http.Request) {
	// Trim "/proxy/" prefix then split into name/action
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/proxy/"), "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"ok": false, "error": "ruta inválida; esperado /proxy/<molinete>/<acción>",
		})
		return
	}
	name, action := parts[0], parts[1]

	t, ok := targets[name]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"ok": false, "error": fmt.Sprintf("target %q no configurado", name),
		})
		return
	}

	switch action {
	case "abrir":
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
				"ok": false, "error": "usar POST para /abrir",
			})
			return
		}
		log.Printf("[%s] apertura — target=%s modo=%s", time.Now().Format(time.RFC3339), name, t.Mode)
		body, code := abrirTarget(t)
		writeJSON(w, code, body)

	case "estado":
		writeJSON(w, http.StatusOK, estadoTarget(t))

	default:
		writeJSON(w, http.StatusNotFound, map[string]any{
			"ok": false, "error": fmt.Sprintf("acción %q desconocida", action),
		})
	}
}

func handleStatus(w http.ResponseWriter, _ *http.Request) {
	summary := map[string]any{}
	for name, t := range targets {
		summary[name] = estadoTarget(t)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "targets": summary})
}

func main() {
	cfg = loadConfig()
	targets = resolveTargets(cfg)
	initSerialTargets()

	// /proxy/* requires secret; /status is read-only.
	http.HandleFunc("/proxy/", withCORS(withSecret(handleProxy)))
	http.HandleFunc("/status", withCORS(handleStatus))

	// Bind explícito a 127.0.0.1 — solo el proceso local alcanza este puerto (C1).
	addr := "127.0.0.1:" + strconv.Itoa(cfg.HTTPPort)
	log.Printf("\n=== MOLINETE DRIVER / GymProxy (Go) ===")
	log.Printf("HTTP:     http://%s", addr)
	log.Printf("Targets:  %d configurado(s)", len(targets))
	for name, t := range targets {
		if t.Mode == "serial" {
			log.Printf("  [%s] serial → %s (pin=%s pulse=%dms sim=%v)", name, t.ComPort, t.Pin, t.PulseMs, t.simMode)
		} else {
			log.Printf("  [%s] proxy  → %s", name, t.TargetURL)
		}
	}
	log.Printf("========================================\n")

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("[FATAL] %v", err)
	}
}
