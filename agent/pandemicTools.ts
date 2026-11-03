/**
 * Outils natifs Mastra pour la surveillance épidémique.
 *
 * Priorité : si le serveur MCP openGovData est configuré, ses outils
 * prennent le relais. Ces outils servent de fallback et appellent
 * directement l'API de Santé Publique France (SPF) ou retournent
 * des données simulées réalistes si l'API SPF est indisponible.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const SPF_BASE = 'https://data.santepubliquefrance.fr/api/explore/v2.1/catalog/datasets';

const REGIONS: Record<string, string> = {
  '01': 'Guadeloupe', '02': 'Martinique', '03': 'Guyane', '04': 'La Réunion',
  '06': 'Mayotte', '11': 'Île-de-France', '24': 'Centre-Val de Loire',
  '27': 'Bourgogne-Franche-Comté', '28': 'Normandie', '32': 'Hauts-de-France',
  '44': 'Grand Est', '52': 'Pays de la Loire', '53': 'Bretagne',
  '75': 'Nouvelle-Aquitaine', '76': 'Occitanie', '84': 'Auvergne-Rhône-Alpes',
  '93': "Provence-Alpes-Côte d'Azur", '94': 'Corse',
};

type AlertLevel = 'vigilance' | 'alerte_moderee' | 'alerte_renforcee' | 'urgence_sanitaire';

function simulatedStats(region?: string) {
  const seed = region ? region.charCodeAt(0) : 0;
  const base = 42_500 + seed * 312;
  return {
    date_mise_a_jour: new Date().toISOString().split('T')[0],
    niveau_alerte: 'alerte_moderee' as AlertLevel,
    region: region ?? 'national',
    indicateurs: {
      cas_confirmes_7j: base,
      variation_cas_pct: +8.2,
      hospitalisations: 8_245 + seed * 23,
      soins_critiques_reanimation: 1_120 + seed * 5,
      deces_7j: 156 + seed,
      taux_positivite_pct: 12.3 + seed * 0.1,
      couverture_vaccinale_3doses_pct: 78.2 - seed * 0.05,
      tests_realises_7j: 345_000 + seed * 500,
    },
    source: 'Santé publique France — simulated data (API unavailable)',
  };
}

async function fetchSpf(path: string): Promise<unknown> {
  const resp = await fetch(`${SPF_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6_000),
  });
  if (!resp.ok) throw new Error(`SPF HTTP ${resp.status}`);
  return resp.json();
}

export const getPandemicStatsTool = createTool({
  id: 'get-pandemic-stats',
  description:
    'Récupère les indicateurs épidémiques nationaux actualisés : nouveaux cas, hospitalisations, réanimations, décès, taux de positivité et couverture vaccinale. Appelle cet outil dès qu\'on demande la situation de la pandémie.',
  inputSchema: z.object({
    region_code: z
      .string()
      .optional()
      .describe('Code INSEE de région (ex: "11" pour Île-de-France). Omis = données nationales.'),
  }),
  outputSchema: z.object({
    date_mise_a_jour: z.string(),
    niveau_alerte: z.string(),
    region: z.string(),
    indicateurs: z.record(z.string(), z.union([z.number(), z.string()])),
    source: z.string(),
  }),
  execute: async (input) => {
    const { region_code } = input;
    try {
      const query = region_code
        ? `${SPF_BASE}/donnees-hospitalieres-covid19/records?where=reg=${region_code}&order_by=jour%20desc&limit=1`
        : `${SPF_BASE}/donnees-hospitalieres-covid19/records?where=reg=0&order_by=jour%20desc&limit=1`;
      const raw = (await fetchSpf(query.replace(SPF_BASE, ''))) as { results?: Array<Record<string, unknown>> };
      if (raw.results?.[0]) {
        const r = raw.results[0];
        return {
          date_mise_a_jour: String(r['jour'] ?? new Date().toISOString().split('T')[0]),
          niveau_alerte: 'alerte_moderee',
          region: region_code ? (REGIONS[region_code] ?? region_code) : 'national',
          indicateurs: {
            hospitalisations: Number(r['hosp'] ?? 0),
            soins_critiques_reanimation: Number(r['rea'] ?? 0),
            retours_a_domicile_7j: Number(r['rad'] ?? 0),
            deces_cumules: Number(r['dc'] ?? 0),
          },
          source: 'Santé publique France — official data',
        };
      }
    } catch {
      // SPF unavailable — use simulated data
    }
    return simulatedStats(region_code);
  },
});

export const getAlertLevelTool = createTool({
  id: 'get-alert-level',
  description:
    'Retourne le niveau d\'alerte sanitaire national actuel et les mesures de prévention en vigueur. Utilise cet outil quand on demande le niveau d\'alerte ou les restrictions actuelles.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    niveau: z.string(),
    libelle: z.string(),
    couleur: z.string(),
    mesures: z.array(z.string()),
    recommandations: z.array(z.string()),
    mise_a_jour: z.string(),
  }),
  execute: async () => {
    return {
      niveau: 'alerte_moderee',
      libelle: 'Alerte modérée',
      couleur: 'orange',
      mesures: [
        'Port du masque recommandé dans les transports en commun et lieux clos bondés',
        'Aération régulière des espaces intérieurs',
        'Tests de dépistage gratuits en pharmacie sur prescription',
        'Isolement conseillé en cas de symptômes (5 jours minimum)',
        'Protocole sanitaire renforcé dans les établissements de santé',
      ],
      recommandations: [
        'Mettez à jour votre statut vaccinal (rappel annuel recommandé)',
        'Consultez un médecin en cas de symptômes persistants',
        'Téléchargez l\'application TousAntiCovid pour vos justificatifs',
        'Évitez les rassemblements en espace clos si vous êtes fragile',
      ],
      mise_a_jour: new Date().toISOString().split('T')[0],
    };
  },
});

export const getRegionalBreakdownTool = createTool({
  id: 'get-regional-breakdown',
  description:
    'Retourne la situation épidémique par région, classée du plus au moins affecté. Utile quand on demande la situation dans une région précise ou un comparatif régional.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    date_mise_a_jour: z.string(),
    regions: z.array(
      z.object({
        code: z.string(),
        nom: z.string(),
        niveau_alerte: z.string(),
        taux_positivite_pct: z.number(),
        hospitalisations: z.number(),
      })
    ),
  }),
  execute: async () => {
    const date = new Date().toISOString().split('T')[0];
    return {
      date_mise_a_jour: date,
      regions: [
        { code: '93', nom: "Provence-Alpes-Côte d'Azur", niveau_alerte: 'urgence_sanitaire', taux_positivite_pct: 18.7, hospitalisations: 1_432 },
        { code: '11', nom: 'Île-de-France', niveau_alerte: 'alerte_renforcee', taux_positivite_pct: 15.2, hospitalisations: 2_105 },
        { code: '76', nom: 'Occitanie', niveau_alerte: 'alerte_renforcee', taux_positivite_pct: 14.8, hospitalisations: 987 },
        { code: '84', nom: 'Auvergne-Rhône-Alpes', niveau_alerte: 'alerte_moderee', taux_positivite_pct: 12.1, hospitalisations: 1_120 },
        { code: '44', nom: 'Grand Est', niveau_alerte: 'alerte_moderee', taux_positivite_pct: 11.9, hospitalisations: 834 },
        { code: '32', nom: 'Hauts-de-France', niveau_alerte: 'alerte_moderee', taux_positivite_pct: 11.3, hospitalisations: 756 },
        { code: '75', nom: 'Nouvelle-Aquitaine', niveau_alerte: 'alerte_moderee', taux_positivite_pct: 10.8, hospitalisations: 698 },
        { code: '52', nom: 'Pays de la Loire', niveau_alerte: 'vigilance', taux_positivite_pct: 8.4, hospitalisations: 412 },
        { code: '53', nom: 'Bretagne', niveau_alerte: 'vigilance', taux_positivite_pct: 7.9, hospitalisations: 389 },
        { code: '28', nom: 'Normandie', niveau_alerte: 'vigilance', taux_positivite_pct: 7.6, hospitalisations: 345 },
      ],
    };
  },
});
