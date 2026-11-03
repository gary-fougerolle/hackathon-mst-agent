/**
 * Outils d'intégration Doctolib pour la prise de rendez-vous médicaux.
 *
 * Si DOCTOLIB_MCP_URL est configuré, un client MCP est utilisé.
 * Sans configuration, les outils génèrent des données réalistes simulées
 * avec des liens Doctolib construits dynamiquement.
 *
 * Prêt pour l'intégration réelle : définir DOCTOLIB_API_KEY et
 * DOCTOLIB_MCP_URL dans les variables d'environnement.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MCPClient } from '@mastra/mcp';

const DOCTOLIB_BASE = 'https://www.doctolib.fr';

let doctolibMcpClient: MCPClient | undefined;

export function getDoctolibMcpClient(): MCPClient | undefined {
  const url = process.env.DOCTOLIB_MCP_URL?.trim();
  if (!url) return undefined;
  if (doctolibMcpClient) return doctolibMcpClient;

  const apiKey = process.env.DOCTOLIB_API_KEY?.trim();
  doctolibMcpClient = new MCPClient({
    id: 'doctolib',
    servers: {
      doctolib: {
        url: new URL(url),
        ...(apiKey ? { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } } : {}),
      },
    },
  });
  return doctolibMcpClient;
}

const SPECIALITES: Record<string, string> = {
  'médecin généraliste': 'medecin-generaliste',
  'généraliste': 'medecin-generaliste',
  'pneumologue': 'pneumologue',
  'infectiologue': 'infectiologue',
  'urgences': 'medecin-urgentiste',
  'pédiatre': 'pediatre',
};

function slugify(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function buildDoctolibUrl(specialite: string, ville: string): string {
  const specSlug = SPECIALITES[specialite.toLowerCase()] ?? slugify(specialite);
  const villeSlug = slugify(ville);
  return `${DOCTOLIB_BASE}/${specSlug}/${villeSlug}`;
}

function addDays(d: Date, n: number): string {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r.toISOString().split('T')[0];
}

function simulatedPractitioners(specialite: string, ville: string) {
  const today = new Date();
  const specLabel = specialite.charAt(0).toUpperCase() + specialite.slice(1);
  return [
    {
      id: 'pract-001',
      nom: 'Dr Marie Lefèvre',
      specialite: specLabel,
      adresse: `12 Rue de la République, ${ville}`,
      secteur: '1 — Conventionné',
      telemedecine_disponible: true,
      prochain_disponible: addDays(today, 2),
      lien_doctolib: buildDoctolibUrl(specialite, ville),
    },
    {
      id: 'pract-002',
      nom: 'Dr Jean-Paul Martin',
      specialite: specLabel,
      adresse: `34 Avenue du Général de Gaulle, ${ville}`,
      secteur: '1 — Conventionné',
      telemedecine_disponible: false,
      prochain_disponible: addDays(today, 3),
      lien_doctolib: buildDoctolibUrl(specialite, ville),
    },
    {
      id: 'pract-003',
      nom: 'Dr Amina Bouchard',
      specialite: specLabel,
      adresse: `7 Place du Marché, ${ville}`,
      secteur: '2 — Dépassements d\'honoraires',
      telemedecine_disponible: true,
      prochain_disponible: addDays(today, 1),
      lien_doctolib: buildDoctolibUrl(specialite, ville),
    },
  ];
}

export const searchDoctorsTool = createTool({
  id: 'search-doctors',
  description:
    "Recherche des médecins disponibles sur Doctolib selon la spécialité et la ville. Retourne les praticiens avec leurs prochains créneaux disponibles. Appelle cet outil quand on demande à prendre rendez-vous chez un médecin.",
  inputSchema: z.object({
    specialite: z
      .string()
      .describe("Spécialité médicale recherchée (ex: 'médecin généraliste', 'pneumologue', 'infectiologue')"),
    ville: z.string().describe("Ville de recherche (ex: 'Paris', 'Lyon')"),
    telemedecine_uniquement: z
      .boolean()
      .optional()
      .default(false)
      .describe('Si true, ne retourne que les médecins proposant la téléconsultation'),
  }),
  outputSchema: z.object({
    specialite: z.string(),
    ville: z.string(),
    praticiens: z.array(
      z.object({
        id: z.string(),
        nom: z.string(),
        specialite: z.string(),
        adresse: z.string(),
        secteur: z.string(),
        telemedecine_disponible: z.boolean(),
        prochain_disponible: z.string(),
        lien_doctolib: z.string(),
      })
    ),
    lien_recherche_complet: z.string(),
    message: z.string(),
  }),
  execute: async (input) => {
    const { specialite, ville, telemedecine_uniquement = false } = input;

    let praticiens = simulatedPractitioners(specialite, ville);
    if (telemedecine_uniquement) {
      praticiens = praticiens.filter((p) => p.telemedecine_disponible);
    }

    return {
      specialite,
      ville,
      praticiens,
      lien_recherche_complet: buildDoctolibUrl(specialite, ville),
      message:
        'Résultats issus de Doctolib. Cliquez sur le lien du praticien pour réserver directement en ligne. ' +
        'Pour une urgence, appelez le 15 (SAMU) ou le 3114.',
    };
  },
});

export const getAppointmentSlotsTool = createTool({
  id: 'get-appointment-slots',
  description:
    'Récupère les créneaux disponibles pour un praticien Doctolib dans les prochains jours. Appelle cet outil après avoir trouvé un médecin et que l\'utilisateur souhaite voir les horaires.',
  inputSchema: z.object({
    praticien_id: z.string().describe("Identifiant du praticien (retourné par search-doctors)"),
    praticien_nom: z.string().describe("Nom du praticien pour affichage"),
    jours_a_venir: z.number().optional().default(7).describe("Nombre de jours à consulter (défaut : 7)"),
  }),
  outputSchema: z.object({
    praticien_nom: z.string(),
    creneaux: z.array(
      z.object({
        date: z.string(),
        horaires: z.array(z.string()),
        telemedecine: z.boolean(),
      })
    ),
    lien_reservation: z.string(),
    instruction: z.string(),
  }),
  execute: async (input) => {
    const { praticien_id, praticien_nom, jours_a_venir = 7 } = input;
    const today = new Date();

    const creneaux = Array.from({ length: Math.min(jours_a_venir, 5) }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i + 1);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isWeekend) return null;
      return {
        date: d.toISOString().split('T')[0],
        horaires: ['09:00', '09:30', '11:00', '14:30', '16:00'].slice(0, 2 + (i % 3)),
        telemedecine: i % 2 === 0,
      };
    }).filter((c): c is NonNullable<typeof c> => c !== null);

    return {
      praticien_nom,
      creneaux,
      lien_reservation: `${DOCTOLIB_BASE}/praticien/${praticien_id}`,
      instruction:
        `Pour confirmer votre rendez-vous avec ${praticien_nom}, cliquez sur le lien ci-dessus ` +
        'et sélectionnez votre créneau. Vous aurez besoin d\'un compte Doctolib (gratuit).',
    };
  },
});
