/** El separador de un monto COP es de miles. Estas pantallas no traen centavos. */
export function parseCop(raw: string): number | null {
  const match = raw.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/);
  if (!match) return null;
  const value = Number(match[1].replace(/[.,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Junto a "km", la coma o el punto es decimal. */
export function parseKm(raw: string): number | null {
  const match = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function isStandalonePrice(line: string): boolean {
  return /^(?:COL)?\$?\s*\d{1,3}(?:[.,]\d{3})+(?:\s*COP)?$/i.test(line.trim());
}
