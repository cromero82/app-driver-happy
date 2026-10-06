import { evaluate } from "./decide.ts";
import { classify, parseScreen } from "./parse.ts";
import { thresholds, type Thresholds } from "./thresholds.ts";
import type { Analysis } from "./types.ts";

export function analyze(text: string, config: Thresholds = thresholds): Analysis {
  const screen = classify(text);
  const offers = parseScreen(text, screen).map((offer) => evaluate(offer, config));
  return { screen, offers };
}

export { classify, parseScreen };
export { thresholds };
export type { Analysis, Evaluation, Offer, ScreenKind } from "./types.ts";
