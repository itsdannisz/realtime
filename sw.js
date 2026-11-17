/* RealTime • Banco de Horas — service worker
   - Páginas: tenta a internet primeiro (sempre a versão mais nova) e usa a cópia guardada se estiver offline.
   - Arquivos de apoio (ícones, fontes, biblioteca do Supabase): usa a cópia guardada e atualiza em segundo plano.
   - NUNCA guarda chamadas ao Supabase nem à detecção de IP: os dados sempre vêm ao vivo. */
const VERSAO = 'realtime-v2';
const BASE = [
  './',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
const EXTERNOS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
];
const IGNORAR = ['supabase.co', 'ipify.org'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    await Promise.all(BASE.map(u => cache.add(u).catch(() => {})));
    // Biblioteca externa (resposta "opaca": só dá para guardar via fetch + put)
    await Promise.all(EXTERNOS.map(async (u) => {
      try { await cache.put(u, await fetch(u, { mode: 'no-cors' })); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (IGNORAR.some(h => url.hostname.endsWith(h))) return; // dados sempre ao vivo

  // Abrir o app / navegar: internet primeiro, cópia guardada se estiver offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const guardado = await caches.match('./');
      try {
        // Com cópia guardada, não espera a internet por mais de 4 s; sem cópia (1ª visita), espera normalmente
        const pedido = guardado
          ? Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 4000))])
          : fetch(req);
        const nova = await pedido;
        if (nova.ok) {
          const cache = await caches.open(VERSAO);
          cache.put('./', nova.clone());
          return nova;
        }
        return guardado || nova; // resposta com erro: prefere a última cópia boa
      } catch (e) {
        return guardado || Response.error();
      }
    })());
    return;
  }

  // Demais arquivos: usa o guardado e atualiza em segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const guardado = await cache.match(req);
    const rede = fetch(req).then((resp) => {
      if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
      return resp;
    }).catch(() => guardado);
    return guardado || rede;
  })());
});
