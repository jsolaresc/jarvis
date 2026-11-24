// Genera src/ui/icono.png (se corre una sola vez; el resultado ya viene en el proyecto).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 256, height: 256 } });
  await pagina.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect x="8" y="8" width="240" height="240" rx="64" fill="#000"/>
    <rect x="76" y="80" width="38" height="96" rx="19" fill="#8BE9FF"/>
    <rect x="142" y="80" width="38" height="96" rx="19" fill="#8BE9FF"/></svg></body>`);
  await pagina.screenshot({ path: path.join(__dirname, '..', 'src', 'ui', 'icono.png'), omitBackground: true });
  await navegador.close();
})();
