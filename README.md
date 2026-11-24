# Jarvis · asistente de voz para Windows

Un asistente que vive en un notch (una pastilla con ojos) arriba de tu pantalla. Lo llamás por su
nombre, le pedís algo en castellano y lo hace en tu PC: abrir programas y juegos, poner música,
series o el partido, mandar WhatsApp, avisarte de mensajes, mails y eventos, guardar clips de
pantalla, descargar videos, tomar notas y más.

**Escuchar, decidir y hablar es gratis y local**: el oído, la voz y los comandos de todos los días
corren en tu computadora, sin cuentas propias, sin servidores intermedios y sin suscripciones.

> Lo podés llamar como quieras: al instalar te pregunta **"¿Cómo querés llamarme?"** (por defecto,
> "Jarvis"). Ese nombre es también la palabra que lo despierta: "che Viernes, poné música".

## Instalar

1. Bajá **`Jarvis-Setup-x.y.z.exe`** de la última versión en
   [Releases](https://github.com/jsolaresc/jarvis/releases/latest).
2. Abrilo. Como el instalador no está firmado, Windows puede mostrar "Windows protegió su PC":
   tocá **Más información → Ejecutar de todas formas**.
3. En la página **Tu asistente** elegí:
   - **Cómo querés llamarlo** (el nombre que lo despierta).
   - **Qué componentes bajar** (todos opcionales, se pueden bajar después):

     | Componente | Para qué | Peso |
     |---|---|---|
     | Escuchar y hablar (recomendado) | Pasar tu voz a texto y contestarte hablando, sin internet | ~530 MB |
     | Voz argentina (Daniela) | Otra voz, rioplatense | ~110 MB |
     | Voces Kokoro (Dora y Alex) | Voces más naturales, acento neutro | ~365 MB |
     | ffmpeg | Clips de pantalla, notas de voz, entrenar voces, unir video y audio | ~80 MB |
     | yt-dlp | "Descargá este video" (YouTube y otros sitios) | ~18 MB |

   - Si querés que **arranque con Windows**.
4. Al terminar abre el asistente y baja en segundo plano lo que tildaste.

Lo que no tildes lo bajás cuando quieras desde **Ajustes → Sistema → Componentes**.

También hay una versión **portable** (`Jarvis-Portable-x.y.z.exe`, no se instala y guarda todo al
lado del exe), pero esa no se actualiza sola.

## Actualizaciones

La versión instalada busca versiones nuevas en las Releases de este repositorio, las baja en segundo
plano y las instala cuando cerrás el asistente (o al tocar **Reiniciar y actualizar** en
Ajustes → Sistema → Actualizaciones). Tu configuración no se toca.

## Tus datos

Todo lo que configurás y lo que el asistente recuerda queda **solo en tu PC**, en
`%APPDATA%\Jarvis\datos`: configuración, rutinas, notas, la sesión de WhatsApp, las claves que
cargues, los modelos de voz. El programa no manda nada a ningún servidor del desarrollador (no hay).
Para borrar todo, desinstalalo y borrá esa carpeta.

¿Venías usando una copia portable? En **Ajustes → Sistema → Componentes → Traer datos de otro
Jarvis** elegís la carpeta `datos` de esa copia y se pasa todo (también el WhatsApp vinculado).
No uses las dos copias a la vez con el mismo WhatsApp.

## Cómo piensa (y por qué es gratis)

1. **Escuchar**, en tu PC: detecta cuándo hablás (Silero VAD) y lo pasa a texto con Parakeet (vía
   sherpa-onnx). Sin internet, sin límite. Para despertarlo busca su nombre al principio de lo que
   decís, con las formas en que el oído lo suele escribir ("Yarvis", "Biernes"…). Si no te
   reconoce bien, en **Ajustes → Asistente → Escucha → Enseñarle** lo decís un par de veces y aprende
   cómo lo escribe cuando lo decís vos. Con el nombre "Jarvis" se suma además el detector clásico
   "Hey Jarvis" de openWakeWord.
2. **Decidir**: los pedidos comunes (rutinas, música, volumen, programas, clima, recordatorios,
   clips, fotos por WhatsApp…) se resuelven con reglas, al instante. Lo demás va a un **modelo
   gratuito** que configures en **Ajustes → Asistente → Inteligencia**: Groq, Gemini (modelos de
   texto) u Ollama (local). Con uno alcanza; sin ninguno, igual hace todos los comandos directos.
3. **Hablar**, en tu PC: voces Piper o Kokoro vía sherpa-onnx, o la voz de Windows.

Las claves y cuentas (Groq, Gemini, TMDB, Tavily, Gmail, Google Calendar, WhatsApp) las cargás
vos en Ajustes y quedan solo en tu PC. El repositorio no trae ninguna.

## Qué puede hacer

- **Rutinas por voz o con un botón**: abrir programas o juegos de Steam, cambiar la salida de audio,
  mandar mensajes, cambiar de modo, etc.
- **Música, series y fútbol**: YouTube Music en la PC o en un Chromecast/Nest; series y películas en
  el servicio donde estén (con una clave gratuita de TMDB); "poné el partido de tal equipo".
- **Avisos**: WhatsApp, mail (Gmail) y calendario, con reglas por persona, sonidos y lectura en voz alta.
- **Clips**: repetición instantánea de la pantalla con el sonido del juego; editar, recortar y mandar.
- **Notas y recordatorios**, también "anotá lo que estoy viendo" y notas de voz.
- **Descargas** con yt-dlp: "descargá este video", "bajame el audio de esto".
- **Voces propias**: grabá o subí audios y entrená una voz nueva (en tu placa, por WSL).
- **App para el celular** (opcional, por Tailscale): escribirle y lanzar rutinas desde afuera.

## Desde el código

Hace falta **Node.js 20.19+ o 22.12+**.

```powershell
npm install
npm start          # abre el asistente (los datos van a .\datos)
npm run prueba     # pruebas automáticas de la lógica
npm run revisar-privacidad   # que no quede nada personal antes de subir cambios
```

Para armar el instalador en Windows: `npm run armar-instalador` (queda en `dist/`).

### Publicar una versión nueva

1. Subí el número en `package.json` (`"version": "1.0.1"`).
2. `git commit -am "Versión 1.0.1" && git push`
3. GitHub Actions (`.github/workflows/publicar.yml`) ve el cambio de `package.json`, arma el
   instalador y el portable y los publica en Releases como `v1.0.1`. Las copias instaladas se
   actualizan solas. (También se puede correr a mano: pestaña Actions → Publicar versión → Run workflow.)

Antes de subir, `npm run revisar-privacidad` busca claves, mails, teléfonos y rutas personales. Si
creás un archivo `.privado.txt` (no se sube) con tus nombres, mails o contactos, uno por línea,
también los busca.

## Licencias y créditos

El código de este repositorio es MIT (ver `LICENSE`). Usa, entre otros:
[Electron](https://www.electronjs.org/), [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
(Parakeet, Silero VAD, voces Piper y Kokoro, que se bajan de sus releases oficiales),
[openWakeWord](https://github.com/dscripka/openWakeWord) (los modelos de `modelos/`; el de
"hey jarvis" está publicado bajo CC BY-NC-SA 4.0, uso no comercial),
[Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp, no oficial),
[yt-dlp](https://github.com/yt-dlp/yt-dlp) y [ffmpeg](https://ffmpeg.org/).

Es un proyecto personal, gratuito y sin garantías. Conectar WhatsApp con una librería no oficial
puede ir contra sus condiciones: usalo bajo tu responsabilidad.
