// jarvis-red: une esta PC a la red privada de Tailscale del usuario (sin la app de Tailscale) y le pasa a Jarvis
// lo que llega por ahí. Habla con Jarvis por stdout: una línea JSON cada vez que cambia el estado.
// Si Jarvis se cierra (se cierra stdin), se cierra también.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"tailscale.com/tsnet"
)

func emitir(m map[string]any) {
	b, _ := json.Marshal(m)
	fmt.Println(string(b))
}

func main() {
	dir := flag.String("dir", "", "carpeta donde guarda la sesión de Tailscale")
	nombre := flag.String("nombre", "jarvis-pc", "nombre de esta PC en la red")
	destino := flag.String("destino", "127.0.0.1:47820", "servidor del celular de Jarvis")
	puerto := flag.Int("puerto", 47820, "puerto en la red de Tailscale")
	salir := flag.Bool("salir", false, "cerrar la sesión de Tailscale de esta PC y terminar")
	flag.Parse()

	s := &tsnet.Server{Dir: *dir, Hostname: *nombre, Logf: func(string, ...any) {}, UserLogf: func(f string, a ...any) { fmt.Fprintf(os.Stderr, f+"\n", a...) }}
	if err := s.Start(); err != nil {
		emitir(map[string]any{"estado": "error", "texto": err.Error()})
		os.Exit(1)
	}
	lc, err := s.LocalClient()
	if err != nil {
		emitir(map[string]any{"estado": "error", "texto": err.Error()})
		os.Exit(1)
	}
	if *salir {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = lc.Logout(ctx)
		emitir(map[string]any{"estado": "NeedsLogin"})
		s.Close()
		return
	}

	go func() {
		ln, err := s.Listen("tcp", fmt.Sprintf(":%d", *puerto))
		if err != nil {
			emitir(map[string]any{"estado": "error", "texto": "no pude escuchar en la red: " + err.Error()})
			return
		}
		proxy := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: "http", Host: *destino})
		proxy.FlushInterval = -1 // las esperas largas (/api/novedades) y los videos, sin acumular
		_ = http.Serve(ln, proxy)
	}()
	go func() { _, _ = io.Copy(io.Discard, os.Stdin); s.Close(); os.Exit(0) }()

	ultimo := ""
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		st, err := lc.StatusWithoutPeers(ctx)
		cancel()
		m := map[string]any{}
		if err != nil {
			m["estado"] = "Starting"
		} else {
			m["estado"] = st.BackendState
			if st.AuthURL != "" {
				m["url"] = st.AuthURL
			}
			if len(st.TailscaleIPs) > 0 && st.BackendState == "Running" {
				for _, ip := range st.TailscaleIPs {
					if ip.Is4() {
						m["ip"] = ip.String()
					}
				}
				if st.Self != nil {
					m["nombre"] = strings.TrimSuffix(st.Self.DNSName, ".")
				}
			}
		}
		b, _ := json.Marshal(m)
		if string(b) != ultimo {
			ultimo = string(b)
			fmt.Println(ultimo)
		}
		time.Sleep(2 * time.Second)
	}
}
