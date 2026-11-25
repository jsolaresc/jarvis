// Package movil: Tailscale adentro de la app de Android de Jarvis (gomobile bind).
// La app se une a la red privada del usuario y abre un proxy en 127.0.0.1 hacia la PC; la app web le habla a ese
// proxy cuando no está en la Wi-Fi de casa. Android no deja a las apps leer las interfaces de red desde Go: la app
// se las pasa desde Java con FijarInterfaces antes de Iniciar.
package movil

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	_ "tailscale.com/feature/androidbin" // DNS sin /etc/resolv.conf y certificados del sistema, como en la app de Tailscale
	"tailscale.com/net/netmon"
	"tailscale.com/tsnet"
)

var (
	mu       sync.Mutex
	srv      *tsnet.Server
	proxies  = map[string]int{}
	interfas []netmon.Interface
)

type interfazJSON struct {
	Nombre string   `json:"nombre"`
	Indice int      `json:"indice"`
	MTU    int      `json:"mtu"`
	Arriba bool     `json:"arriba"`
	Dirs   []string `json:"dirs"`
}

// FijarInterfaces recibe las interfaces de red del celular (JSON: [{nombre, indice, mtu, arriba, dirs:["192.168.0.5/24"]}]).
func FijarInterfaces(js string) error {
	var lista []interfazJSON
	if err := json.Unmarshal([]byte(js), &lista); err != nil {
		return err
	}
	nuevas := []netmon.Interface{}
	for _, x := range lista {
		flags := net.Flags(0)
		if x.Arriba {
			flags |= net.FlagUp | net.FlagRunning | net.FlagMulticast | net.FlagBroadcast
		}
		if strings.HasPrefix(x.Nombre, "lo") {
			flags |= net.FlagLoopback
		}
		var dirs []net.Addr
		for _, d := range x.Dirs {
			if ip, red, err := net.ParseCIDR(d); err == nil {
				red.IP = ip
				dirs = append(dirs, red)
			}
		}
		nuevas = append(nuevas, netmon.Interface{Interface: &net.Interface{Index: x.Indice, MTU: x.MTU, Name: x.Nombre, Flags: flags}, AltAddrs: dirs})
	}
	mu.Lock()
	interfas = nuevas
	mu.Unlock()
	netmon.RegisterInterfaceGetter(func() ([]netmon.Interface, error) {
		mu.Lock()
		defer mu.Unlock()
		return append([]netmon.Interface(nil), interfas...), nil
	})
	return nil
}

// Iniciar une el celular a la red (dir: carpeta de la app para la sesión).
func Iniciar(dir, nombre string) error {
	mu.Lock()
	defer mu.Unlock()
	if srv != nil {
		return nil
	}
	// En Android no hay $HOME: algunas partes de Tailscale lo buscan para sus archivos.
	if os.Getenv("HOME") == "" {
		_ = os.Setenv("HOME", dir)
	}
	s := &tsnet.Server{Dir: dir, Hostname: nombre, Logf: func(string, ...any) {}}
	if err := s.Start(); err != nil {
		return err
	}
	srv = s
	return nil
}

// Estado devuelve JSON: {"estado": "NeedsLogin"|"Starting"|"Running"|"apagado", "url": …, "ip": …}.
func Estado() string {
	mu.Lock()
	s := srv
	mu.Unlock()
	m := map[string]any{"estado": "apagado"}
	if s != nil {
		m["estado"] = "Starting"
		if lc, err := s.LocalClient(); err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
			st, err := lc.StatusWithoutPeers(ctx)
			cancel()
			if err == nil {
				m["estado"] = st.BackendState
				if st.AuthURL != "" {
					m["url"] = st.AuthURL
				}
				for _, ip := range st.TailscaleIPs {
					if ip.Is4() && st.BackendState == "Running" {
						m["ip"] = ip.String()
					}
				}
			}
		}
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// Proxy abre (una vez por destino) un proxy en 127.0.0.1 hacia destino ("100.x.y.z:47820") por la red de Tailscale.
func Proxy(destino string) (int, error) {
	mu.Lock()
	defer mu.Unlock()
	if srv == nil {
		return 0, errors.New("Tailscale no está iniciado")
	}
	if p, ok := proxies[destino]; ok {
		return p, nil
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	s := srv
	rp := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: "http", Host: destino})
	rp.FlushInterval = -1
	rp.Transport = &http.Transport{DialContext: s.Dial, ResponseHeaderTimeout: 0, IdleConnTimeout: 60 * time.Second}
	base := rp.Director
	rp.Director = func(r *http.Request) { base(r); r.Host = destino }
	go func() { _ = http.Serve(ln, rp) }()
	p := ln.Addr().(*net.TCPAddr).Port
	proxies[destino] = p
	return p, nil
}

// Salir cierra la sesión de Tailscale de este celular.
func Salir() error {
	mu.Lock()
	s := srv
	mu.Unlock()
	if s == nil {
		return nil
	}
	lc, err := s.LocalClient()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return lc.Logout(ctx)
}
