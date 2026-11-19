"use client";

// In-app confirmation (instead of the browser's own confirm popup): `const [confirm, dialog] = useConfirm();`
// render `{dialog}` somewhere, then `if (!(await confirm({ title: "Demolish?" }))) return;`.
import { useCallback, useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for things that remove or lose something (red button). */
  tone?: "danger" | "normal";
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest((old) => {
          old?.resolve(false); // a new question replaces an unanswered one
          return { ...options, resolve };
        });
      }),
    [],
  );
  const answer = useCallback((ok: boolean) => {
    setRequest((r) => {
      r?.resolve(ok);
      return null;
    });
  }, []);
  const dialog = request ? <ConfirmDialog {...request} onAnswer={answer} /> : null;
  return [confirm, dialog] as const;
}

function ConfirmDialog({ title, message, confirmLabel = "OK", cancelLabel = "Cancel", tone = "normal", onAnswer }: ConfirmOptions & { onAnswer: (ok: boolean) => void }) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmButton.current?.focus();
    // Escape cancels, and only cancels (it doesn't also leave full screen or stop a tool behind the dialog).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onAnswer(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onAnswer]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center" onClick={() => onAnswer(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-bold">
          {title}
        </h2>
        {message && (
          <p id="confirm-message" className="mt-1.5 text-sm text-muted">
            {message}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary min-h-11 px-4" onClick={() => onAnswer(false)}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButton}
            type="button"
            onClick={() => onAnswer(true)}
            className={`min-h-11 rounded-xl px-4 font-semibold ${tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "btn-primary"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
