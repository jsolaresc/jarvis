# Qué cambió en cada versión

Cada Release de GitHub toma de acá la sección de su versión. Al subir de versión, sumar la sección nueva arriba de todo.

## 1.1.12

**Celular**
- Arreglado: el celular podía olvidarse de la dirección para entrar desde afuera. Si la app se abría en casa justo cuando la PC todavía estaba conectando Tailscale (por ejemplo, recién prendida o actualizada), la borraba, y al salir de casa decía "Tu PC no responde". Ahora no se borra nunca, y la PC le pasa la última que anduvo.
- Ajustes → Tu PC muestra la dirección de afuera, con un botón "Probar".
- Si la PC no responde, el aviso dice si falta aprender la dirección de afuera (abrir la app una vez en casa) o si la PC no contesta por ningún lado.

## 1.1.11

**Celular**
- **Escritorio remoto**: ver la pantalla de la PC (con su sonido) y manejarla tocando, como AnyDesk. En Más → "Escritorio de la PC" o en Control de la PC.
  - Dos modos: Touchpad (deslizar mueve el cursor) o Tocar (el clic va donde tocás).
  - Pellizcar hace zoom, y el zoom sigue al cursor. Dos dedos desplazan; mantener apretado arrastra.
  - Tiene teclado, teclas especiales, clic derecho y cambio de pantalla si tenés más de una.
  - Se prende en la PC (Ajustes → Dispositivos → Celular → Escritorio remoto) y el notch avisa mientras alguien mira.
  - La imagen va directo entre el celular y la PC. Desde afuera de casa anda si las redes lo permiten (algunas no dejan).
- **Archivos de la PC**:
  - Miniaturas de fotos, videos y documentos.
  - Filtros (Fotos, Videos, Audio, Documentos), búsqueda, orden (más nuevos, más viejos, nombre, más pesados) y vista en cuadrícula.
  - Elegir varios para bajarlos, compartirlos o mandarlos por WhatsApp desde la PC (sin gastar datos del celular).
- Las rutinas muestran qué hace cada paso y cuándo se hacen solas.

**PC**
- Arreglado: descargar para el celular a veces terminaba con "yt-dlp terminó pero no encuentro el archivo". Pasaba con títulos con acentos o emojis, como los de X.
- El Historial de una rutina dice qué hizo cada paso, no solo "salió todo bien".

## 1.1.10

**PC**
- Editor de clips más claro:
  - Los textos y recuadros ahora se pueden mover arrastrándolos sobre el video (antes no andaba) y cambiar de tamaño desde la esquina. Doble clic en un texto para escribirlo; Supr lo quita; las flechas lo corren.
  - Un texto o recuadro nuevo se ve en todo el clip; con "Desde acá" / "Hasta acá" lo acotás.
  - Se edita uno a la vez: los demás quedan como etiquetas arriba para elegirlos.
  - "✂ Cortar acá" (o la tecla S) está junto a la línea de tiempo. Los pedazos se ven solo cuando hay más de uno, y se pueden duplicar de un toque.
  - Deshacer (Ctrl+Z) para todo lo editado, incluidas las manijas. Ctrl+C / Ctrl+V / Ctrl+D copian, pegan y duplican.
  - El panel de edición arranca abierto.

## 1.1.9

**PC**
- **Editor de clips** ("Edición", abajo del video): cortar en pedazos donde está el video, borrarlos o cambiarlos de orden, copiar y pegar un pedazo (también en otro clip), sumar otro clip al final, velocidad por pedazo o para todo (0,5x a 2x), sin sonido por pedazo, vertical 9:16 o cuadrado con encuadre, textos y recuadros (con borde o rellenos para tapar algo) que se arrastran sobre el video, y fundido al empezar y terminar. "Ver cómo queda" reproduce el resultado. Favoritos con la estrella.
- **Clips por voz exactos**: el clip termina justo cuando empezás a decir "che Jarvis" (antes podía cortar varios segundos antes).
- Sistema → **Estado de la PC**: procesador, memoria, placa de video (temperatura y uso con NVIDIA) y lo que gasta cada parte de Jarvis. También como widget del notch.
- **Ahorro**: la repetición instantánea se pausa con la PC bloqueada o suspendida y vuelve sola al desbloquear (se puede apagar en Clips).
- **Rutinas que se hacen solas**: a una hora (y qué días), al abrir un juego de Steam o un programa, al conectar un aparato de audio, al llegar a casa con el celular o al prender la PC. 20 íconos nuevos y un paso nuevo, "Pedirle algo a Jarvis".
- **Historial**: "Repetir" y "Hacer rutina" en cada pedido.
- Almacenamiento → **Tus videos**: elegí varios (Shift elige un rango), comprimilos juntos o mandalos a la Papelera.
- **Música en varios aparatos a la vez** (grupos de Google Home): el audio va al grupo y suena sincronizado.
- Ajustes → Celular: **carpetas que ve el celular** y **vigilar con la cámara** (aviso al celular y video cuando hay movimiento).
- Las Releases dicen qué cambió.

**Celular**
- **Ajustes** propios de la app (en Más y en el menú ⋮): avisos, huella, voz, cámara, versión.
- **Archivos de la PC** (Archivos → Carpetas): navegá las carpetas que elijas en la PC, bajá lo que quieras y subí archivos, en casa y desde afuera. Compartí cualquier archivo desde otra app a Jarvis: va a una carpeta de la PC o por WhatsApp.
- **Control de la PC**: touchpad, teclado, música, volumen, bloquear, suspender, apagar y prenderla por la Wi-Fi de casa (Wake-on-LAN, tiene que estar activado en la placa de red).
- Los pedidos quedan en espera si la PC no responde y salen solos cuando vuelve.
- Cámara de seguridad: **vigilar** (aviso y grabación cuando hay movimiento) y **hablar por los parlantes** de la PC (mantener apretado el micrófono).
- **Huella opcional** para abrir la app.
- **Avisos al instante** (opcional, en Ajustes).
- Widget de Android en la pantalla de inicio (Hablar, Cámara, Clip, Control) y atajos al mantener apretado el ícono.
- Widget "Estado de la PC"; "Repetir" y "Hacer rutina" en el Historial; las rutinas también se programan desde el celular.

## 1.1.8
- Celular: widgets rehechos (mantener apretado para mover, agrandar desde la esquina, tamaño y color), widget "Hablale a Jarvis" con voz y **cámara de seguridad**.
- PC: Clips rehecho (Guardar con Deshacer, Guardar una copia, menú ⋯), pantalla completa, vista previa de clips que no se veían (HEVC de NVIDIA), convertir para editar, comprimir, MP3 y GIF. Las descargas salen en un formato que abre After Effects.

## 1.1.7
- yt-dlp con versión y botón "Actualizar" en Sistema → Componentes.
- Avisos en Ajustes → Inicio: Jarvis nuevo listo para instalar, yt-dlp desactualizado y componentes con error.

## 1.1.6
- Celular: Notas, Calendario, Rutinas e Historial, igual que en la PC (pestaña "Más").

## 1.1.5
- El celular desde afuera sin VPN (Tailscale Funnel en la PC). Videos y recortes de clips desde el celular. En la PC, todos los clips con filtros y páginas.

## 1.1.4
- Widgets del celular con el estilo de la PC, música a otro aparato desde el celular y actualizar la app desde la app.

## 1.1.3
- Música a la tele y a los Nest.

## 1.1.2
- El celular también desde afuera (Tailscale integrado).

## 1.1.1
- Inicio con widgets en el celular, avisos en el celular, foto con texto por WhatsApp y arreglos.

## 1.1.0
- App de Android con modo casa.

## 1.0.2
- El clima reintenta y tiene un servicio de respaldo.

## 1.0.1
- App del celular mejorada y pantalla de Información.

## 1.0.0
- Primera versión pública instalable.
