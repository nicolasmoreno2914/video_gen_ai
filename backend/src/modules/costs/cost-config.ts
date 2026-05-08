// Central pricing config — update here when API prices change
export const COST_CONFIG = {
  openai: {
    models: {
      'gpt-4o': { inputPerMillionTokens: 2.50, outputPerMillionTokens: 10.00 },
      'gpt-4o-mini': { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.60 },
      default: { inputPerMillionTokens: 2.50, outputPerMillionTokens: 10.00 },
    },
    dalle: {
      standard1792x1024: 0.04,
      standard1024x1024: 0.02,
      hd1792x1024: 0.08,
    },
  },
  elevenlabs: {
    perCharacter: 0.00003,
  },
  render: {
    perVideoMinute: 0.02,
  },
  youtube: {
    quotaUnitsPerUpload: 100,
    estimatedUsd: 0,
  },
} as const;

export function calcOpenAiTextCost(
  inputTokens: number,
  outputTokens: number,
  modelName: string,
): number {
  const models = COST_CONFIG.openai.models as Record<
    string,
    { inputPerMillionTokens: number; outputPerMillionTokens: number }
  >;
  const pricing = models[modelName] ?? models['default'];
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillionTokens +
    (outputTokens / 1_000_000) * pricing.outputPerMillionTokens
  );
}

export function calcDalleCost(
  imageCount: number,
  size = '1792x1024',
  quality = 'standard',
): number {
  const price =
    (COST_CONFIG.openai.dalle as Record<string, number>)[`${quality}${size}`] ??
    COST_CONFIG.openai.dalle.standard1792x1024;
  return imageCount * price;
}

export function calcElevenLabsCost(characters: number): number {
  return characters * COST_CONFIG.elevenlabs.perCharacter;
}

export function calcRenderCost(durationSeconds: number): number {
  return (durationSeconds / 60) * COST_CONFIG.render.perVideoMinute;
}
