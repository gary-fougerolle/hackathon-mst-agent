/**
 * Sélection du modèle : Anthropic via la passerelle Astro (entrée `anthropic`
 * dans astropods.yml) OU la passerelle Fabric compatible Anthropic.
 *
 * ANTHROPIC_API_KEY est toujours requis et injecté par la plateforme.
 * FABRIC_BASE_URL + FABRIC_GATEWAY_KEY sont optionnels — si les deux sont
 * définis, Fabric prend la priorité même si ANTHROPIC_API_KEY est présent.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import type { MastraModelConfig } from '@mastra/core/llm';

const ANTHROPIC_MODEL_ID = 'anthropic/claude-sonnet-4-5';
const FABRIC_MODEL_ID = 'claude-sonnet-4-6';

function createFabricGatewayModel(modelId: string = FABRIC_MODEL_ID): MastraModelConfig {
  const baseURL = process.env.FABRIC_BASE_URL;
  const gatewayKey = process.env.FABRIC_GATEWAY_KEY;
  if (!baseURL || !gatewayKey) {
    throw new Error('FABRIC_BASE_URL et FABRIC_GATEWAY_KEY doivent tous deux être définis pour utiliser la passerelle Fabric.');
  }

  const versionedBaseURL = `${baseURL.replace(/\/+$/, '')}/v1`;

  const gatewayAnthropic = createAnthropic({
    baseURL: versionedBaseURL,
    apiKey: 'unused',
    headers: { 'X-Gateway-Key': gatewayKey },
  });

  return gatewayAnthropic(modelId) as MastraModelConfig;
}

export function resolveModel(): MastraModelConfig {
  if (process.env.FABRIC_BASE_URL && process.env.FABRIC_GATEWAY_KEY) {
    console.log('[model] FABRIC configuré — utilisation de la passerelle Fabric.');
    return createFabricGatewayModel();
  }

  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[model] Fabric non configuré — utilisation d\'Anthropic via la passerelle Astro.');
    return ANTHROPIC_MODEL_ID;
  }

  throw new Error(
    'Aucun modèle configuré. Définissez ANTHROPIC_API_KEY via `ast project configure` ' +
      'ou configurez FABRIC_BASE_URL + FABRIC_GATEWAY_KEY pour utiliser la passerelle Fabric.'
  );
}
