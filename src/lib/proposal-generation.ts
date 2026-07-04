export const SPECIFIC_GENERATION_KWH_PER_KWP = 1700;
export const ESTIMATED_PERFORMANCE_RATIO = 75;
export const SYSTEM_LIFETIME_YEARS = 25;
/** India grid emission factor (kg CO₂ per kWh). */
export const CO2_KG_PER_KWH = 0.82;
export const CO2_KG_PER_TREE_YEAR = 21;
export const COAL_KG_PER_KWH = 0.5;
/** Litres of petrol equivalent per kWh (approx.). */
export const PETROL_LITRES_PER_KWH = 0.08;
/** km driven per litre of petrol (approx.). */
export const KM_PER_PETROL_LITRE = 15;
/** Acres of forest equivalent per metric ton CO₂ per year. */
export const FOREST_ACRES_PER_TON_CO2_YEAR = 1.17;

export type GenerationEstimate = {
  systemKw: number;
  annualGenerationKwh: number;
  monthlyAverageKwh: number;
  specificGenerationKwhPerKwp: number;
  performanceRatioPercent: number;
};

export type MonthlyGenerationRow = {
  month: string;
  acEnergyKwh: number;
};

export type EnvironmentalImpact = {
  co2OffsetMetricTons: number;
  equivalentTreesPlanted: number;
  coalBurnAvoidedMetricTons: number;
  petrolLitresAvoided: number;
  equivalentKmDriven: number;
  equivalentAcresOfForest: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Average daily shortwave solar energy (kWh/m²) at Jalgaon, Maharashtra.
 * Source: WeatherSpark historical climate data for Jalgaon (21.0°N, 75.6°E).
 */
export const JALGAON_MONTHLY_SOLAR_FACTORS = [
  5.5, 6.3, 6.9, 7.0, 6.4, 5.1, 4.8, 5.2, 5.4, 5.4, 5.2, 5.1,
] as const;

export function calculateGenerationEstimate(systemKw: number): GenerationEstimate {
  const annualGenerationKwh = Math.round(systemKw * SPECIFIC_GENERATION_KWH_PER_KWP);
  return {
    systemKw,
    annualGenerationKwh,
    monthlyAverageKwh: Math.round(annualGenerationKwh / 12),
    specificGenerationKwhPerKwp: SPECIFIC_GENERATION_KWH_PER_KWP,
    performanceRatioPercent: ESTIMATED_PERFORMANCE_RATIO,
  };
}

export function calculateMonthlyGeneration(annualGenerationKwh: number): MonthlyGenerationRow[] {
  const factorSum = JALGAON_MONTHLY_SOLAR_FACTORS.reduce((sum, factor) => sum + factor, 0);
  const rows = MONTHS.map((month, index) => ({
    month,
    acEnergyKwh: Math.round(
      (annualGenerationKwh * JALGAON_MONTHLY_SOLAR_FACTORS[index]!) / factorSum,
    ),
  }));

  const roundedSum = rows.reduce((sum, row) => sum + row.acEnergyKwh, 0);
  const delta = annualGenerationKwh - roundedSum;
  if (delta !== 0) {
    const peakIndex = JALGAON_MONTHLY_SOLAR_FACTORS.indexOf(
      Math.max(...JALGAON_MONTHLY_SOLAR_FACTORS),
    );
    rows[peakIndex]!.acEnergyKwh += delta;
  }

  return rows;
}

export function calculateEnvironmentalImpact(annualGenerationKwh: number): EnvironmentalImpact {
  const lifetimeKwh = annualGenerationKwh * SYSTEM_LIFETIME_YEARS;
  const co2OffsetKg = lifetimeKwh * CO2_KG_PER_KWH;
  const co2OffsetMetricTons = Math.round((co2OffsetKg / 1000) * 100) / 100;
  const annualCo2Tons = co2OffsetMetricTons / SYSTEM_LIFETIME_YEARS;
  const coalBurnAvoidedMetricTons =
    Math.round(((lifetimeKwh * COAL_KG_PER_KWH) / 1000) * 100) / 100;
  const petrolLitresAvoided = Math.round(lifetimeKwh * PETROL_LITRES_PER_KWH);
  const equivalentKmDriven = Math.round(petrolLitresAvoided * KM_PER_PETROL_LITRE);
  const equivalentTreesPlanted = Math.round(co2OffsetKg / CO2_KG_PER_TREE_YEAR);
  const equivalentAcresOfForest =
    Math.round(annualCo2Tons * FOREST_ACRES_PER_TON_CO2_YEAR * 100) / 100;

  return {
    co2OffsetMetricTons,
    equivalentTreesPlanted,
    coalBurnAvoidedMetricTons,
    petrolLitresAvoided,
    equivalentKmDriven,
    equivalentAcresOfForest,
  };
}
