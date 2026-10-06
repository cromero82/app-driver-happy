export interface Thresholds {
  city: string;
  negociarBelowCopPerKm: number;
  optimoMinCopPerKm: number;
}

export const contiguousPrimeZones = ["Poblado", "Belén", "Envigado", "Itagüí", "Sabaneta"];

/** Minutos desde medianoche, hora de Bogotá. El fin no entra. */
export const peakWindows = [
  { start: 6 * 60, end: 9 * 60 },
  { start: 17 * 60, end: 20 * 60 },
];

export const nightWindow = { start: 19 * 60, end: 5 * 60 };

/** COP por km (recogida + viaje). Justo queda entre los dos cortes. */
export const thresholds: Thresholds = {
  city: "Medellin",
  negociarBelowCopPerKm: 2000,
  optimoMinCopPerKm: 3500,
};
