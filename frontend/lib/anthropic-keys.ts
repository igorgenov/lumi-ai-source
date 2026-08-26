// AI keys split per task (Aibis wants per-task cost visibility in his own dashboard,
// 2026-08-13) — mirror of backend/app/core/config.py's anthropic_key_* properties.
// Each task-scoped key falls back to ANTHROPIC_API_KEY when unset, so nothing breaks
// before every key has actually been provisioned and set in the environment.
export function anthropicKeyAnalysis(): string {
  return process.env.ANTHROPIC_API_KEY_ANALYSIS || process.env.ANTHROPIC_API_KEY || "";
}

export function anthropicKeyInsights(): string {
  return process.env.ANTHROPIC_API_KEY_INSIGHTS || process.env.ANTHROPIC_API_KEY || "";
}

export function anthropicKeyDealReasons(): string {
  return process.env.ANTHROPIC_API_KEY_DEAL_REASONS || process.env.ANTHROPIC_API_KEY || "";
}

export function anthropicKeyDigest(): string {
  return process.env.ANTHROPIC_API_KEY_DIGEST || process.env.ANTHROPIC_API_KEY || "";
}
