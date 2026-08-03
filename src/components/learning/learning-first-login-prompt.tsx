"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  LEARNING_UI,
  useLearning,
} from "@/components/learning/learning-provider";

export function LearningFirstLoginPrompt() {
  const {
    showFirstLoginPrompt,
    dismissFirstLoginPrompt,
    entering,
    t,
    learningMode,
  } = useLearning();

  if (learningMode) return null;

  return (
    <Dialog.Root
      open={showFirstLoginPrompt}
      onOpenChange={(open) => {
        if (!open) void dismissFirstLoginPrompt(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(100%-2rem,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-slate-900">
            {t(LEARNING_UI.firstLoginTitle)}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-600">
            {t(LEARNING_UI.firstLoginBody)}
          </Dialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              onClick={() => void dismissFirstLoginPrompt(false)}
            >
              {t(LEARNING_UI.firstLoginLater)}
            </button>
            <button
              type="button"
              disabled={entering}
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
              onClick={() => void dismissFirstLoginPrompt(true)}
            >
              {entering ? "…" : t(LEARNING_UI.firstLoginStart)}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
