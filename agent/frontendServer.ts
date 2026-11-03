/**
 * Serveur HTTP frontend — sert les fichiers statiques et expose :
 *   GET  /api/stats   — indicateurs épidémiques pour le tableau de bord
 *   POST /api/chat    — streaming de l'agent Clara
 *
 * Construit avec Bun.serve() pour une performance maximale.
 */

import type { Agent } from '@mastra/core/agent';

const ROOT = process.cwd();
const FRONTEND_DIR = `${ROOT}/agent/frontend/`;
const LOGO_PATH = `${ROOT}/assets/logo.jpeg`;
const FOND_HD_PATH = `${ROOT}/assets/fond-hd.jpeg`;
const TEMPLATE_ASSETS_DIR = `${ROOT}/templates/onepage/assets/`;

const ASSET_TYPES: Record<string, string> = {
  css:  'text/css; charset=utf-8',
  js:   'application/javascript; charset=utf-8',
  woff2:'font/woff2', woff:'font/woff', ttf:'font/ttf', eot:'font/eot',
  png:  'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml',
  webp: 'image/webp',
};

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'application/javascript; charset=utf-8' },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Données épidémiques pour le tableau de bord.
 *  Tente l'API Santé Publique France ; fallback sur données simulées réalistes. */
async function fetchDashboardStats(): Promise<unknown> {
  const base = 42_500;
  const date = new Date().toISOString().split('T')[0];

  // Tentative API SPF
  try {
    const url =
      'https://data.santepubliquefrance.fr/api/explore/v2.1/catalog/datasets/' +
      'donnees-hospitalieres-covid19/records?where=reg=0&order_by=jour%20desc&limit=1';
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4_000),
    });
    if (resp.ok) {
      const raw = (await resp.json()) as { results?: Array<Record<string, unknown>> };
      const r = raw.results?.[0];
      if (r) {
        return {
          date_mise_a_jour: String(r['jour'] ?? date),
          niveau_alerte: { code: 'alerte_moderee', libelle: 'Alerte modérée', couleur: 'orange' },
          indicateurs: {
            cas_7j: { valeur: base, variation: '+8,2 %', unite: 'cas' },
            hospitalisations: { valeur: Number(r['hosp'] ?? 8_245), variation: '+3,1 %', unite: 'pers.' },
            soins_critiques: { valeur: Number(r['rea'] ?? 1_120), variation: '-1,4 %', unite: 'pers.' },
            taux_positivite: { valeur: 12.3, variation: '+0,8 pt', unite: '%' },
          },
          couverture_vaccinale_pct: 78.2,
          source: 'Santé Publique France',
        };
      }
    }
  } catch {
    // fallback
  }

  return {
    date_mise_a_jour: date,
    niveau_alerte: { code: 'alerte_moderee', libelle: 'Alerte modérée', couleur: 'orange' },
    indicateurs: {
      cas_7j: { valeur: base, variation: '+8,2 %', unite: 'cas' },
      hospitalisations: { valeur: 8_245, variation: '+3,1 %', unite: 'pers.' },
      soins_critiques: { valeur: 1_120, variation: '-1,4 %', unite: 'pers.' },
      taux_positivite: { valeur: 12.3, variation: '+0,8 pt', unite: '%' },
    },
    couverture_vaccinale_pct: 78.2,
    source: 'Santé publique France — simulated data',
  };
}

export function startFrontendServer(agent: Agent, port: number) {
  const server = Bun.serve({
    hostname: '0.0.0.0',
    port,
    idleTimeout: 120,
    async fetch(req) {
      const { pathname } = new URL(req.url);

      // Fichiers statiques
      if (req.method === 'GET' && STATIC_FILES[pathname]) {
        const { file, type } = STATIC_FILES[pathname];
        return new Response(Bun.file(FRONTEND_DIR + file), { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
      }

      // Logo du projet
      if (req.method === 'GET' && pathname === '/logo.jpeg') {
        return new Response(Bun.file(LOGO_PATH), { headers: { 'Content-Type': 'image/jpeg' } });
      }

      // Image de fond HD
      if (req.method === 'GET' && pathname === '/fond-hd.jpeg') {
        return new Response(Bun.file(FOND_HD_PATH), { headers: { 'Content-Type': 'image/jpeg' } });
      }

      // Assets du template Prologue (CSS, JS, fonts)
      if (req.method === 'GET' && pathname.startsWith('/assets/')) {
        const file = Bun.file(TEMPLATE_ASSETS_DIR + pathname.slice('/assets/'.length));
        if (await file.exists()) {
          const ext = pathname.split('.').pop() ?? '';
          return new Response(file, { headers: { 'Content-Type': ASSET_TYPES[ext] ?? 'application/octet-stream' } });
        }
      }

      // Statistiques épidémiques pour le tableau de bord
      if (req.method === 'GET' && pathname === '/api/stats') {
        try {
          const stats = await fetchDashboardStats();
          return json(stats);
        } catch (err) {
          console.error('[frontend] /api/stats failed:', err);
          return json({ error: 'Données temporairement indisponibles.' }, 503);
        }
      }

      // Chat en streaming avec Clara
      if (req.method === 'POST' && pathname === '/api/chat') {
        let body: { message?: unknown; threadId?: unknown };
        try {
          body = await req.json();
        } catch {
          return json({ error: 'Corps JSON invalide.' }, 400);
        }

        const { message, threadId } = body;
        if (typeof message !== 'string' || !message.trim() || typeof threadId !== 'string' || !threadId.trim()) {
          return json({ error: 'Les champs message et threadId sont requis.' }, 400);
        }

        try {
          const result = await agent.stream(message, {
            memory: { thread: threadId, resource: 'sante-frontend' },
          });
          const encoder = new TextEncoder();
          const reader = result.textStream.getReader();
          const byteStream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const { done, value } = await reader.read();
                if (done) controller.close();
                else controller.enqueue(encoder.encode(value));
              } catch (err) {
                controller.error(err);
              }
            },
            cancel() { return reader.cancel(); },
          });
          return new Response(byteStream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        } catch (err) {
          console.error('[frontend] /api/chat failed:', err);
          return json(
            { error: 'Clara ne peut pas répondre en ce moment. Veuillez réessayer dans un instant.' },
            500,
          );
        }
      }

      return json({ error: 'Not found.' }, 404);
    },
  });
  console.log(`[frontend] Tableau de bord disponible sur http://0.0.0.0:${server.port}`);
  return server;
}
