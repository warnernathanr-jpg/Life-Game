"use client";

// Pick an icon for a task or goal: a button showing the current icon that opens a grid of choices. The choice is sent
// with the form as a hidden field (`name`), or reported through onChange.
import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { ICON_NAMES, type IconName } from "@/lib/task-icons";
import { CHOICE_ICONS, ItemIcon } from "./icons";

export function IconPicker({
  name = "icon",
  value: controlled,
  defaultValue = null,
  area,
  onChange,
}: {
  name?: string;
  value?: IconName | null;
  defaultValue?: IconName | null;
  /** Shown (as the life area's icon) while nothing is picked. */
  area?: string | null;
  onChange?: (v: IconName | null) => void;
}) {
  const [own, setOwn] = useState<IconName | null>(defaultValue);
  const value = controlled !== undefined ? controlled : own;
  const [open, setOpen] = useState(false);
  const choose = (v: IconName | null) => {
    setOwn(v);
    onChange?.(v);
    setOpen(false);
  };
  return (
    <div className="relative">
      <input type="hidden" name={name} value={value ?? ""} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={value ? `Icon: ${value.replace(/-/g, " ")}. Change icon` : "Choose an icon"}
        title="Choose an icon"
        className="mt-1 flex h-11 w-16 items-center justify-center gap-1 rounded-lg border border-line bg-raised text-ink shadow-sm hover:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <ItemIcon icon={value} area={area} className="size-5 text-accent-text" />
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[min(22rem,90vw)] rounded-xl bg-surface p-2 shadow-2xl ring-1 ring-line" role="listbox" aria-label="Icons">
          <div className="grid grid-cols-8 gap-1">
            {ICON_NAMES.map((n) => {
              const Icon = CHOICE_ICONS[n];
              return (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={value === n}
                  aria-label={n.replace(/-\d$/, "").replace(/-/g, " ")}
                  title={n.replace(/-\d$/, "").replace(/-/g, " ")}
                  onClick={() => choose(n)}
                  className={`flex aspect-square items-center justify-center rounded-lg ${value === n ? "bg-accent text-on-accent" : "text-ink hover:bg-raised"}`}
                >
                  <Icon className="size-5" aria-hidden />
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => choose(null)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-sm text-muted hover:bg-raised">
            <X className="size-4" aria-hidden /> Use the life area&apos;s icon
          </button>
        </div>
      )}
    </div>
  );
}
