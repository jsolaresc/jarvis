# red: Tailscale adentro de Jarvis

Para usar Jarvis desde el celular fuera de casa sin instalar la app de Tailscale. Usa `tsnet` (Tailscale como librería):
la PC y el celular se suman a la red privada de Tailscale del usuario (una cuenta gratis, se inicia sesión una vez en cada uno).

- `pc/`: `jarvis-red.exe`. Lo arranca Jarvis (`src/main/red.js`). Se une a la red como `jarvis-<pc>` y lo que llega por ahí
  al puerto 47820 se lo pasa al servidor del celular de Jarvis (127.0.0.1:47820). Avisa su estado por stdout (una línea JSON:
  `{"estado":"NeedsLogin","url":…}` / `{"estado":"Running","ip":"100.x","nombre":…}`). Se cierra solo si Jarvis se cierra.
- `movil/`: librería para la app de Android (`gomobile bind` → `android-app/android/app/libs/jarvisred.aar`). La app se une a
  la red y abre un proxy en 127.0.0.1 hacia la PC; la app web le habla a ese proxy cuando no está en la Wi-Fi de casa.

No hay go.sum en el repo: el sandbox donde se escribe Jarvis no llega a los módulos de Go. Los workflows de GitHub lo
completan con `go mod tidy` antes de compilar (`.github/workflows/publicar.yml` y `android.yml`).
