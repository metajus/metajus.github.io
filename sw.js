// Service Worker do MetaJus — guarda só a "casca" do app (telas, estilos, scripts).
// Dados de processos NUNCA são guardados em cache: vêm sempre do banco.
// Ao publicar uma nova versão, aumente o número abaixo para os celulares atualizarem.
const VERSAO = 'metajus-v15';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/db.js',
  './js/parser.js',
  './js/graficos.js',
  './js/modelos.js',
  './js/impressao.js',
  './js/leitor-doc.js',
  './js/auth.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/pj-al-logo.png',
  './icons/marca-dagua.jpg'
];

const BIBLIOTECAS = [
  'cdn.jsdelivr.net',
  'cdn.sheetjs.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const mesmoSite = url.origin === self.location.origin;
  const biblioteca = BIBLIOTECAS.includes(url.hostname);
  if (!mesmoSite && !biblioteca) return; // Supabase e demais: direto na rede, sem cache

  // Rede primeiro (pega versão nova), cache como reserva quando estiver sem internet.
  // 'no-cache' = sempre confere com o servidor se há versão nova (evita ficar preso em arquivo antigo)
  e.respondWith(
    fetch(mesmoSite ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req)
      .then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
