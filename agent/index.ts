/**
 * healthcare-ma-sante-tranquille — Clara, the Ma Santé Tranquille assistant.
 *
 * Clara, l'assistante de l'app Ma Santé Tranquille (équipe Médecins Sans Tokens), répond aux
 * questions des citoyens sur la pandémie en cours : situation épidémique,
 * trouver une pharmacie pour se faire dépister, prendre un rendez-vous
 * médical via Doctolib.
 *
 * Variables d'environnement :
 *   ANTHROPIC_API_KEY    — injectée par le modèle Astro (requis par défaut)
 *   FABRIC_BASE_URL      — passerelle Fabric optionnelle (voir model.ts)
 *   FABRIC_GATEWAY_KEY   — clé passerelle Fabric (voir model.ts)
 *   GOV_DATA_MCP_URL     — serveur MCP openGovData (optionnel)
 *   GOV_DATA_MCP_TOKEN   — token MCP openGovData (optionnel)
 *   DOCTOLIB_MCP_URL     — serveur MCP Doctolib (optionnel)
 *   DOCTOLIB_API_KEY     — clé API Doctolib (optionnel)
 *   GRPC_SERVER_ADDR     — injecté par le service de messagerie Astro
 */

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { Observability } from '@mastra/observability';
import { OtelExporter } from '@mastra/otel-exporter';
// import { serve } from '@astropods/adapter-mastra'; // activé quand la gateway distante est connectée

import { resolveModel } from './model';
import { getGovDataTools } from './govDataMcp';
import { getPandemicStatsTool, getAlertLevelTool, getRegionalBreakdownTool } from './pandemicTools';
import { findNearestPharmacyTool } from './pharmacyTools';
import { searchDoctorsTool, getAppointmentSlotsTool } from './doctolibTools';
import { startFrontendServer } from './frontendServer';

const memory = new Memory({
  storage: new LibSQLStore({ id: 'memory', url: ':memory:' }),
});

function resolveOtlpTracesEndpoint(): string {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  try {
    const url = new URL(raw);
    if (!url.pathname || url.pathname === '/') url.pathname = '/v1/traces';
    return url.toString();
  } catch {
    return `${raw.replace(/\/+$/, '')}/v1/traces`;
  }
}

const observability = new Observability({
  configs: {
    otel: {
      serviceName: process.env.ASTRO_AGENT_NAME ?? 'healthcare-ma-sante-tranquille',
      exporters: [
        new OtelExporter({
          provider: {
            custom: {
              endpoint: resolveOtlpTracesEndpoint(),
              protocol: 'http/protobuf',
            },
          },
        }),
      ],
    },
  },
});

const agent = new Agent({
  id: 'healthcare-ma-sante-tranquille',
  name: 'Clara — Ma Santé Tranquille',
  instructions: `You are Clara, the health assistant of Ma Santé Tranquille, an app built by team Médecins Sans Tokens. You are not an official government service. You help people who feel sick find the right care, without ever making a diagnosis.

**Language and tone:** always answer in the language of the user's question (English if they write in English, French if they write in French, and so on). Be warm, factual and concise. Use short sentences. You may use **bold** for key information (figures, alert levels, emergency numbers). Avoid technical jargon.

**Absolute rules:**
- Never give a personal medical opinion: you inform and guide only.
- For any medical emergency, immediately point to **15 (SAMU)** or **112 (European emergency number)**.
- Never reveal technical details of how you work or the names of your tools.
- Always state the source and date of the epidemic data you share (Santé publique France data when available, otherwise simulated data, and say so).
- Never ask for the user's identity or social security number by default.
- Never book anything without the user's explicit confirmation.

**Your capabilities: always use the available tools, never guess.**

1. **HEALTH SITUATION**: use \`get-pandemic-stats\` and \`get-alert-level\` for the national situation, \`get-regional-breakdown\` for regional data. Always call these tools before answering any question about the epidemic.

2. **TESTING AND PHARMACIES**: use \`find-nearest-pharmacy\` to help find testing sites. Always ask for the postal code or the city if it is missing.

3. **DOCTOR APPOINTMENTS**: use \`search-doctors\` to find available doctors, then \`get-appointment-slots\` if the user wants to see slots. Suggest a video consultation when it is available and appropriate.

**At the start of the conversation:** introduce yourself briefly and offer the three possible actions (situation, testing, appointment).

**Examples of requests and what to do first:**
- "What's going on?" → check the national statistics first
- "Where can I get tested?" → ask for the postal code or the city
- "Book an appointment" → ask for the specialty and the city

If a question is outside your health scope, point to official resources: \`sante.fr\`, \`solidarites-sante.gouv.fr\`, or **3114** (French suicide prevention line) if needed.`,
  model: () => resolveModel(),
  tools: async () => {
    const govMcpTools = await getGovDataTools();
    return {
      ...govMcpTools,
      [getPandemicStatsTool.id]: getPandemicStatsTool,
      [getAlertLevelTool.id]: getAlertLevelTool,
      [getRegionalBreakdownTool.id]: getRegionalBreakdownTool,
      [findNearestPharmacyTool.id]: findNearestPharmacyTool,
      [searchDoctorsTool.id]: searchDoctorsTool,
      [getAppointmentSlotsTool.id]: getAppointmentSlotsTool,
    };
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'agent:healthcare-ma-sante-tranquille'],
      metadata: { agent_id: 'healthcare-ma-sante-tranquille' },
    },
  },
});

new Mastra({
  agents: { 'healthcare-ma-sante-tranquille': agent },
  observability,
});

// serve(agent); // activé quand la gateway Astropods messaging est connectée
startFrontendServer(agent, Number(process.env.PORT ?? 80));
