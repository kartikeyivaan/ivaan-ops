import type { Session } from "next-auth";
import { PRACTICE_COMPANY_CODE } from "@/lib/learning/lessons";

export type SessionCompany = {
  id: string;
  name: string;
  code: string;
  isPractice?: boolean;
};

export function isPracticeCompany(
  company: SessionCompany | null | undefined,
): boolean {
  if (!company) return false;
  return Boolean(company.isPractice) || company.code === PRACTICE_COMPANY_CODE;
}

export function getActiveSessionCompany(
  session: Session | null,
): SessionCompany | null {
  if (!session?.user?.activeCompanyId) return null;
  return (
    session.user.companies.find((c) => c.id === session.user.activeCompanyId) ??
    null
  );
}

export function isLearningMode(session: Session | null): boolean {
  return Boolean(session?.user?.learningMode);
}

/**
 * Mutations allowed only when:
 * - Learning Mode ON + active Practice company, or
 * - Learning Mode OFF + active non-practice company
 */
export function canMutateInSession(session: Session | null): boolean {
  if (!session?.user) return false;
  const active = getActiveSessionCompany(session);
  const practice = isPracticeCompany(active);
  const learning = isLearningMode(session);
  if (learning) return practice;
  return !practice;
}

export function mutationBlockReason(
  session: Session | null,
): "LEARNING_MODE_PRODUCTION_BLOCKED" | "PRACTICE_REQUIRES_LEARNING_MODE" | null {
  if (!session?.user) return null;
  const active = getActiveSessionCompany(session);
  const practice = isPracticeCompany(active);
  const learning = isLearningMode(session);
  if (learning && !practice) return "LEARNING_MODE_PRODUCTION_BLOCKED";
  if (!learning && practice) return "PRACTICE_REQUIRES_LEARNING_MODE";
  return null;
}

export function operationalCompanies(
  companies: SessionCompany[],
): SessionCompany[] {
  return companies.filter((c) => !isPracticeCompany(c));
}
