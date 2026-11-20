"use client";

// Getting started links to /tasks#add-task (and #todo-h). The task list streams in after the page, so scroll once the target
// exists, and for the add form also put the cursor in its first field.
import { useEffect } from "react";

export function ScrollToHash() {
  useEffect(() => {
    function go() {
      const id = location.hash.slice(1);
      if (!id) return;
      let tries = 0;
      const timer = setInterval(() => {
        const el = document.getElementById(id);
        if (el || ++tries > 40) clearInterval(timer);
        if (!el) return;
        const input = id === "add-task" ? el.closest("section")?.querySelector<HTMLInputElement>("input[type=text], input:not([type])") : null;
        // Next.js handles the #hash itself just after (it can reset the scroll and take focus away), so repeat once it settles.
        for (const ms of [0, 500, 1200]) {
          setTimeout(() => {
            if (el.getBoundingClientRect().top > 120 || el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: ms ? "smooth" : "auto", block: "start" });
            input?.focus({ preventScroll: true });
          }, ms);
        }
      }, 100);
    }
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  return null;
}
