import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { mutationBlockReason } from "@/lib/learning/mode";

export function learningMutationGuard(
  session: Session | null,
): NextResponse | null {
  const reason = mutationBlockReason(session);
  if (!reason) return null;

  if (reason === "LEARNING_MODE_PRODUCTION_BLOCKED") {
    return NextResponse.json(
      {
        code: reason,
        message:
          "Learning Mode is on but you are not on the Practice company. Exit Learning Mode or re-enter it.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      code: reason,
      message:
        "The Practice company is only available in Learning Mode. Start Learning Mode from Help.",
    },
    { status: 403 },
  );
}
