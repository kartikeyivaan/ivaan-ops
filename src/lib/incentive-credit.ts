import type { Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/inventory";
import { roundMoney } from "@/lib/quotations";

/** Actual operational total vs incentive-credited total. */
export type DualMetric = {
  actual: number;
  counted: number;
};

export function emptyDualMetric(): DualMetric {
  return { actual: 0, counted: 0 };
}

export function addDualMetric(a: DualMetric, b: DualMetric): DualMetric {
  return {
    actual: a.actual + b.actual,
    counted: a.counted + b.counted,
  };
}

/** Clamp percent to 0–100 and return multiplier (0–1). */
export function incentiveCreditFactor(
  percent: Prisma.Decimal | number | string | null | undefined,
): number {
  const raw = percent == null ? 100 : decimalToNumber(percent);
  const clamped = Math.min(100, Math.max(0, raw));
  return clamped / 100;
}

export function applyIncentiveCredit(
  value: number,
  percent: Prisma.Decimal | number | string | null | undefined,
): DualMetric {
  const factor = incentiveCreditFactor(percent);
  return {
    actual: value,
    counted: value * factor,
  };
}

export function roundDualMoney(metric: DualMetric): DualMetric {
  return {
    actual: roundMoney(metric.actual),
    counted: roundMoney(metric.counted),
  };
}

export function roundDualUnits(metric: DualMetric, decimals = 3): DualMetric {
  const factor = 10 ** decimals;
  return {
    actual: Math.round(metric.actual * factor) / factor,
    counted: Math.round(metric.counted * factor) / factor,
  };
}

/** New-customer KPI: 0% credit firms are excluded from counted; others count as 1. */
export function newCustomerCreditCount(
  percent: Prisma.Decimal | number | string | null | undefined,
): DualMetric {
  const factor = incentiveCreditFactor(percent);
  return {
    actual: 1,
    counted: factor > 0 ? 1 : 0,
  };
}
