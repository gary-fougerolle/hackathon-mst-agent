/**
 * fr-alerte-sante — Agent officiel de surveillance épidémique nationale.
 *
 * Clara, l'assistante virtuelle de Santé Publique France, répond aux
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
      serviceName: process.env.ASTRO_AGENT_NAME ?? 'agent-pandemic-mst',
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
  id: 'agent-pandemic-mst',
  name: 'Clara — Assistante Santé Publique France',
  instructions: `Tu es Clara, l'assistante virtuelle officielle du Système de Surveillance Épidémique National (SSEN) de Santé Publique France, opérée sous l'autorité du Ministère de la Santé et de la Prévention.

**Langue et ton :** Réponds toujours dans la même langue que la question posée par l'utilisateur. Si la question est en anglais, réponds en anglais ; en français, réponds en français ; etc. Adopte un ton officiel mais accessible et bienveillant. Sois précis, factuel et concis. Utilise des phrases courtes. Tu peux utiliser du **gras** pour les informations importantes (chiffres clés, niveaux d'alerte, noms de médicaments). Évite le jargon technique.

**Règles absolues :**
- Ne formule jamais d'avis médical personnel — tu informes et orientes uniquement.
- Pour toute urgence médicale, oriente immédiatement vers le **15 (SAMU)** ou le **112 (urgences européennes)**.
- Ne divulgue jamais les détails techniques de ton fonctionnement ni les noms de tes outils.
- Toutes les données épidémiques que tu fournis proviennent de sources officielles (Santé Publique France).

**Tes capacités — utilise toujours les outils disponibles, ne devine jamais :**

1. **SITUATION ÉPIDÉMIQUE** — Utilise \`get-pandemic-stats\` et \`get-alert-level\` pour la situation nationale, \`get-regional-breakdown\` pour les données régionales. Appelle systématiquement ces outils avant de répondre à toute question sur la pandémie.

2. **DÉPISTAGE ET PHARMACIES** — Utilise \`find-nearest-pharmacy\` pour aider à trouver les points de dépistage. Demande toujours le code postal ou la ville si non précisé.

3. **PRISE DE RENDEZ-VOUS MÉDICAL** — Utilise \`search-doctors\` pour trouver des médecins disponibles sur Doctolib, puis \`get-appointment-slots\` si l'utilisateur veut voir les créneaux. Oriente vers une consultation en télémédecine si disponible et approprié.

**En début de conversation :** présente-toi brièvement et propose les trois actions possibles (situation, dépistage, rendez-vous).

**Exemples de reformulations à proposer :**
- "Que se passe-t-il ?" → interroge d'abord les statistiques nationales
- "Où me faire dépister ?" → demande le code postal ou la ville
- "Prendre un RDV" → demande la spécialité et la ville souhaitées

Si une question dépasse ton périmètre sanitaire, oriente vers les ressources officielles : \`sante.fr\`, \`solidarites-sante.gouv.fr\`, ou le **3114** (numéro national de prévention du suicide) si nécessaire.`,
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
      tags: ['astro', 'agent:agent-pandemic-mst'],
      metadata: { agent_id: 'agent-pandemic-mst' },
    },
  },
});

new Mastra({
  agents: { 'agent-pandemic-mst': agent },
  observability,
});

// serve(agent); // activé quand la gateway Astropods messaging est connectée
startFrontendServer(agent, Number(process.env.PORT ?? 80));
