export const metersToMillimeters = (m: number) => m * 1000;
export const millimetersToMeters = (mm: number) => mm / 1000;
export const squareMillimetersToSquareMeters = (mm2: number) => mm2 / 1000000;
export function formatMeasure(value: number, digits = 3): string { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value); }
