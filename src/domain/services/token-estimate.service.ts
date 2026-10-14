import type { LimitNotice } from './selection-budget.service';
import type { PromptFile } from '../entities/prompt-payload.entity';

const CHARACTERS_PER_TOKEN = 4;
const THOUSAND = 1000;
const MILLION = 1000000;
const ROUNDS_TO_MILLION = 999950;

export interface TokenBudgetNoticeInput {
  tokens: number;
  budget: number;
}

export interface WeighedFile {
  name: string;
  tokens: number;
}

export const estimateTokens = (text: string) =>
  Math.ceil(text.length / CHARACTERS_PER_TOKEN);

export const estimateTokensFromBytes = (bytes: number) =>
  Math.ceil(bytes / CHARACTERS_PER_TOKEN);

const trimmedDecimal = (value: number) => value.toFixed(1).replace(/\.0$/, '');

export const compactTokenCount = (tokens: number) => {
  if (tokens < THOUSAND) return String(tokens);

  if (tokens < ROUNDS_TO_MILLION) {
    return `${trimmedDecimal(tokens / THOUSAND)}k`;
  }

  return `${trimmedDecimal(tokens / MILLION)}M`;
};

export const formatTokenCount = (tokens: number) =>
  `~${compactTokenCount(tokens)} tokens`;

export const tokenBudgetNotice = (
  input: TokenBudgetNoticeInput
): LimitNotice => {
  if (input.budget <= 0 || input.tokens <= input.budget) {
    return { over: false, message: '', args: [] };
  }

  return {
    over: true,
    message:
      'This selection is about {0} tokens, {1} over the budget of {2}. Change files2prompt.tokenBudget, copy anyway, or cancel.',
    args: [
      compactTokenCount(input.tokens),
      compactTokenCount(input.tokens - input.budget),
      compactTokenCount(input.budget)
    ]
  };
};

export const heaviestFiles = (files: PromptFile[], limit = 10): WeighedFile[] =>
  files
    .map(file => ({ name: file.name, tokens: estimateTokens(file.content) }))
    .sort(
      (left, right) =>
        right.tokens - left.tokens || left.name.localeCompare(right.name)
    )
    .slice(0, limit);
