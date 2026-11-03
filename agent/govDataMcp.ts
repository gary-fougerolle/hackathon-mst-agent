/**
 * Connexion MCP openGovData (données ouvertes gouvernementales françaises).
 *
 * Si GOV_DATA_MCP_URL est défini, un client MCP est créé et ses outils sont
 * exposés à l'agent sous le préfixe `govData_<toolName>`.
 * Sans configuration MCP, les outils natifs de pandemicTools.ts prennent le relais.
 *
 * Les outils sont mis en cache 5 minutes pour éviter de surcharger le serveur.
 */

import { MCPClient } from '@mastra/mcp';

const TOOLS_TTL_MS = 5 * 60 * 1000;

type GovTools = Awaited<ReturnType<MCPClient['listTools']>>;

let client: MCPClient | undefined;
let cache: { tools: GovTools; fetchedAt: number } | undefined;

function getClient(): MCPClient | undefined {
  const rawUrl = process.env.GOV_DATA_MCP_URL?.trim();
  if (!rawUrl) return undefined;

  if (client) return client;

  const token = process.env.GOV_DATA_MCP_TOKEN?.trim();

  client = new MCPClient({
    id: 'gov-data',
    servers: {
      govData: {
        url: new URL(rawUrl),
        ...(token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      },
    },
  });
  return client;
}

/** Outils exposés par le serveur MCP openGovData, préfixés `govData_`. Vide si non configuré. */
export async function getGovDataTools(): Promise<GovTools> {
  const c = getClient();
  if (!c) return {};

  if (cache && Date.now() - cache.fetchedAt < TOOLS_TTL_MS) return cache.tools;

  try {
    const tools = await c.listTools();
    cache = { tools, fetchedAt: Date.now() };
    console.log(`[govData] ${Object.keys(tools).length} outils chargés depuis le serveur MCP openGovData`);
    return tools;
  } catch (err) {
    console.error('[govData] Impossible de charger les outils MCP openGovData :', err);
    return cache?.tools ?? {};
  }
}
