// Contexto de la PC: qué ventana está al frente (y, si es un navegador, en qué página) y una captura de la pantalla.
// Se usa para "¿qué estoy viendo?", "¿cómo avanzo en este juego?" y para las notas que guardan el link y una
// captura ("recordame ver este video a las 6"). Nada de esto se mira solo ni se manda a ningún lado sin que lo pidas.
const { spawn } = require('child_process');

const NAVEGADORES = /^(chrome|msedge|brave|opera|opera_gx|vivaldi|firefox|arc|chromium|iexplore)$/i;
const NOMBRES = { chrome: 'Chrome', msedge: 'Edge', brave: 'Brave', opera: 'Opera', opera_gx: 'Opera GX', vivaldi: 'Vivaldi', firefox: 'Firefox', arc: 'Arc', chromium: 'Chromium' };

// Los títulos de los navegadores terminan con el nombre del navegador: "Video - YouTube - Google Chrome".
function limpiarTitulo(titulo) {
  return String(titulo || '').replace(/\s+[-–—]\s+(?:Google Chrome|Microsoft\s*.?\s*Edge|Mozilla Firefox|Brave|Opera(?: GX)?|Vivaldi|Chromium|Perfil \d+.*|Profile \d+.*)\s*$/i, '').replace(/\s+/g, ' ').trim();
}
// Lo que dice el navegador en la barra suele venir sin "https://".
function normalizarEnlace(valor) {
  const v = String(valor || '').trim();
  if (!v || /\s/.test(v)) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return /^https?:\/\//i.test(v) ? v : '';
  if (/^[^./]+\.[^./]+/.test(v) || /^localhost(:|\/|$)/.test(v)) return `https://${v}`;
  return '';
}

const GUION = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class JW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$modoBusqueda = '__MODO__'
$nav = '^(chrome|msedge|brave|opera|opera_gx|vivaldi|firefox|arc|chromium)$'
$propio = '^(jarvis|electron)$'
$r = @{ proceso = ''; titulo = ''; url = ''; producto = ''; frente = '' }
function Info($h) { $p = 0; [void][JW]::GetWindowThreadProcessId($h, [ref]$p); try { Get-Process -Id $p -ErrorAction Stop } catch { $null } }
function Titulo($h) { $sb = New-Object System.Text.StringBuilder 512; [void][JW]::GetWindowText($h, $sb, 512); $sb.ToString() }
try {
  $h = [JW]::GetForegroundWindow()
  $pr = Info $h
  if ($pr) { $r.frente = $pr.ProcessName }
  $buscar = ($pr -and $pr.ProcessName -match $propio) -or ($modoBusqueda -eq 'nav' -and (-not $pr -or $pr.ProcessName -notmatch $nav))
  if ($buscar) {
    $w = [JW]::GetTopWindow([IntPtr]::Zero); $n = 0
    while ($w -ne [IntPtr]::Zero -and $n -lt 400) {
      $n++
      if ([JW]::IsWindowVisible($w) -and -not [JW]::IsIconic($w)) {
        $q = Info $w
        if ($q -and $q.ProcessName -notmatch $propio) {
          $t = Titulo $w
          if ($t -and ($modoBusqueda -ne 'nav' -or $q.ProcessName -match $nav)) { $h = $w; $pr = $q; break }
        }
      }
      $w = [JW]::GetWindow($w, 2)
    }
  }
  if ($pr) {
    $r.proceso = $pr.ProcessName; $r.titulo = Titulo $h
    if (-not $r.titulo) { $r.titulo = $pr.MainWindowTitle }
    try { $r.producto = $pr.MainModule.FileVersionInfo.ProductName } catch {}
    if ($pr.ProcessName -match $nav) {
      $el = [System.Windows.Automation.AutomationElement]::FromHandle($h)
      $c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
      for ($i = 0; $i -lt 4 -and -not $r.url; $i++) {
        if ($i -gt 0) { Start-Sleep -Milliseconds 400 }
        try {
          foreach ($e in $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, $c)) {
            try { $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { continue }
            if ($v -and $v -match '^(https?://)?[^ /]+[.][^ /]+') { $r.url = $v; break }
          }
        } catch {}
      }
    }
  }
} catch {}
$r | ConvertTo-Json -Compress`;

// { proceso, producto, titulo, navegador, url } de la ventana que está al frente, o null si no se pudo saber.
// JARVIS_CONTEXTO_FALSO (un JSON) reemplaza la consulta: solo lo usan las pruebas automáticas.
function ventanaActiva({ espera = 6000, soloNavegador = false } = {}) {
  const falso = process.env.JARVIS_CONTEXTO_FALSO;
  const armar = (d) => {
    const proceso = String(d.proceso || '').trim();
    if (!proceso && !d.titulo) return null;
    const navegador = NAVEGADORES.test(proceso);
    return { frente: String(d.frente || proceso).trim(), proceso, producto: String(d.producto || '').trim(), titulo: navegador ? limpiarTitulo(d.titulo) : String(d.titulo || '').trim(), navegador, url: navegador ? normalizarEnlace(d.url) : '' };
  };
  if (falso) { try { return Promise.resolve(armar(JSON.parse(falso))); } catch { return Promise.resolve(null); } }
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((ok) => {
    let salida = '';
    let hijo;
    try {
      hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(GUION.replace('__MODO__', soloNavegador ? 'nav' : ''), 'utf16le').toString('base64')], { windowsHide: true });
    } catch { ok(null); return; }
    const reloj = setTimeout(() => { try { hijo.kill(); } catch {} ok(null); }, espera);
    hijo.stdout.setEncoding('utf8');
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.on('error', () => { clearTimeout(reloj); ok(null); });
    hijo.on('close', () => {
      clearTimeout(reloj);
      try { ok(armar(JSON.parse(salida.trim().split('\n').pop()))); } catch { ok(null); }
    });
  });
}

// "Chrome: Título de la página" / "Counter-Strike 2"
function describir(v) {
  if (!v) return '';
  const quien = v.navegador ? (NOMBRES[String(v.proceso).toLowerCase()] || v.proceso) : (v.producto && !/microsoft|windows/i.test(v.producto) ? v.producto : v.proceso);
  return v.titulo && v.titulo !== quien ? `${quien}: ${v.titulo}` : quien;
}

// Una captura de la pantalla donde está el mouse, reducida (ancho máximo) y en JPEG: alcanza para leer la mayoría de los textos
// y pesa poco para mandarla a un modelo. Devuelve { jpeg: Buffer, ancho, alto }.
async function capturarPantalla({ ancho = 1280, calidad = 72, nativa = false } = {}) {
  const falsa = process.env.JARVIS_CAPTURA_FALSA;
  if (falsa) { const fs = require('fs'); const b = fs.readFileSync(falsa); return nativa ? { png: b, ancho: 0, alto: 0 } : { jpeg: b, ancho: 0, alto: 0 }; }
  const { desktopCapturer, screen } = require('electron');
  const pantalla = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  // nativa: el tamaño real de la pantalla (para guardar una captura como la sacaría Windows), en PNG.
  const w = nativa ? Math.round(pantalla.size.width * (pantalla.scaleFactor || 1)) : Math.max(320, Math.min(2560, Number(ancho) || 1280));
  const proporcion = pantalla.size.height / pantalla.size.width;
  const tamano = { width: w, height: Math.round(w * proporcion) };
  const fuentes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: tamano });
  const f = fuentes.find((x) => String(x.display_id) === String(pantalla.id)) || fuentes[0];
  if (!f || f.thumbnail.isEmpty()) throw new Error('Windows no me dejó sacar la captura de la pantalla.');
  const t = f.thumbnail.getSize();
  if (nativa) return { png: f.thumbnail.toPNG(), ancho: t.width, alto: t.height };
  return { jpeg: f.thumbnail.toJPEG(Math.max(40, Math.min(95, calidad))), ancho: t.width, alto: t.height };
}

module.exports = { ventanaActiva, capturarPantalla, describir, limpiarTitulo, normalizarEnlace, NAVEGADORES };
