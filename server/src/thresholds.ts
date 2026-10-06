export interface Thresholds {
  city: string;
  negociarBelowCopPerKm: number;
  optimoMinCopPerKm: number;
}

/** COP por km (recogida + viaje). Justo queda entre los dos cortes. */
export const thresholds: Thresholds = {
  city: "Medellin",
  negociarBelowCopPerKm: 2000,
  optimoMinCopPerKm: 3500,
};
