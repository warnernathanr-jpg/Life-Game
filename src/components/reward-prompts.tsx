"use client";

import { useEffect, useState, useTransition } from "react";
import { claimReward, savePushSubscription } from "@/app/(game)/actions";
import { vapidKeyBytes } from "@/lib/push";

type Platform = "ios" | "android" | "desktop";
type Prompt = "install" | "installed" | "notify" | "notified" | null;
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SNOOZE_KEY = "lifecity:prompt-snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
function snoozed(which: string) {
  try {
    const raw = localStorage.getItem(`${SNOOZE_KEY}:${which}`);
    return raw ? Date.now() - Number(raw) < SNOOZE_MS : false;
  } catch {
    return false;
  }
}
function snooze(which: string) {
  try {
    localStorage.setItem(`${SNOOZE_KEY}:${which}`, String(Date.now()));
  } catch {}
}

/**
 * Popups for the two one-time rewards: add the app to the home screen (200 coins, paid when the app is opened from
 * the home screen), then turn on notifications there (200 more, paid once the device is subscribed).
 */
export function RewardPrompts({ claimed }: { claimed: string[] }) {
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [plat, setPlat] = useState<Platform>("desktop");
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasHome = claimed.includes("home_screen");
  const hasNotify = claimed.includes("notifications");

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    const p = platform();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlat(p);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = isStandalone();
    if (standalone && !hasHome) {
      // Opened from the home screen: pay the install reward.
      start(async () => {
        const r = await claimReward("home_screen");
        if (r.ok && r.coins > 0) setPrompt("installed");
      });
      return;
    }
    if (!standalone && !hasHome && !snoozed("install")) {
      const t = setTimeout(() => setPrompt("install"), 1500);
      return () => clearTimeout(t);
    }
    const canNotify = "Notification" in window && "PushManager" in window && Notification.permission !== "denied";
    if (standalone && hasHome && !hasNotify && canNotify && !snoozed("notify")) {
      const t = setTimeout(() => setPrompt("notify"), 1500);
      return () => clearTimeout(t);
    }
  }, [hasHome, hasNotify]);

  function close(which: "install" | "notify") {
    snooze(which);
    setPrompt(null);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setPrompt(null);
  }

  function enableNotifications() {
    setError(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Notifications are blocked. You can turn them on later in your phone's settings for Life City.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes() }));
        const saved = await savePushSubscription(sub.toJSON(), navigator.userAgent);
        if (!saved.ok) return setError(saved.error);
        const r = await claimReward("notifications");
        if (!r.ok) return setError(r.error);
        setPrompt("notified");
      } catch {
        setError("Notifications couldn't be turned on in this browser. Try again from the home-screen app.");
      }
    });
  }

  if (!prompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6" role="dialog" aria-modal="false" aria-labelledby="reward-h">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl">
        {prompt === "install" && (
          <>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>📲</span>
              <div className="min-w-0 flex-1">
                <h2 id="reward-h" className="font-bold">Add Life City to your home screen</h2>
                <p className="text-sm text-coin font-semibold">Get 🪙 200 coins</p>
              </div>
              <button type="button" aria-label="Not now" onClick={() => close("install")} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-raised">×</button>
            </div>
            {installEvent ? (
              <button type="button" className="btn-primary mt-4 w-full" onClick={install}>Install Life City</button>
            ) : plat === "ios" ? (
              <ol className="mt-3 space-y-2 text-sm">
                <li className="flex gap-2"><span className="font-bold text-accent-text">1.</span><span>Tap the <strong>Share</strong> button <span aria-hidden>(the square with an arrow ⬆️)</span> in Safari&apos;s toolbar.</span></li>
                <li className="flex gap-2"><span className="font-bold text-accent-text">2.</span><span>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</span></li>
                <li className="flex gap-2"><span className="font-bold text-accent-text">3.</span><span>Open <strong>Life City</strong> from your home screen to collect your coins.</span></li>
              </ol>
            ) : plat === "android" ? (
              <ol className="mt-3 space-y-2 text-sm">
                <li className="flex gap-2"><span className="font-bold text-accent-text">1.</span><span>Tap the <strong>⋮ menu</strong> at the top right of Chrome.</span></li>
                <li className="flex gap-2"><span className="font-bold text-accent-text">2.</span><span>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</span></li>
                <li className="flex gap-2"><span className="font-bold text-accent-text">3.</span><span>Open <strong>Life City</strong> from your home screen to collect your coins.</span></li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-sm">
                <li className="flex gap-2"><span className="font-bold text-accent-text">1.</span><span>On your phone, open this site in Safari (iPhone) or Chrome (Android).</span></li>
                <li className="flex gap-2"><span className="font-bold text-accent-text">2.</span><span>Add it to your home screen from the Share or ⋮ menu.</span></li>
                <li className="flex gap-2"><span className="font-bold text-accent-text">3.</span><span>Open it from the home screen to collect your coins.</span></li>
              </ol>
            )}
            <button type="button" className="link mt-3 text-sm" onClick={() => close("install")}>Maybe later</button>
          </>
        )}

        {prompt === "installed" && (
          <div className="text-center">
            <p className="text-4xl" aria-hidden>🎉</p>
            <h2 id="reward-h" className="mt-1 font-bold">Thanks for adding Life City!</h2>
            <p className="font-semibold text-coin">+200 coins</p>
            <button type="button" className="btn-primary mt-4 w-full" onClick={() => setPrompt(!hasNotify && "Notification" in window ? "notify" : null)}>Nice!</button>
          </div>
        )}

        {prompt === "notify" && (
          <>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>🔔</span>
              <div className="min-w-0 flex-1">
                <h2 id="reward-h" className="font-bold">Turn on notifications</h2>
                <p className="text-sm font-semibold text-coin">Get 🪙 200 more coins</p>
              </div>
              <button type="button" aria-label="Not now" onClick={() => close("notify")} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-raised">×</button>
            </div>
            <p className="mt-2 text-sm text-muted">Get a nudge for your habits and know when your focus timer is done. You can turn them off any time.</p>
            {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
            <button type="button" className="btn-primary mt-4 w-full" disabled={pending} onClick={enableNotifications}>
              {pending ? "Turning on…" : "Turn on notifications"}
            </button>
            <button type="button" className="link mt-3 text-sm" onClick={() => close("notify")}>Maybe later</button>
          </>
        )}

        {prompt === "notified" && (
          <div className="text-center">
            <p className="text-4xl" aria-hidden>🔔</p>
            <h2 id="reward-h" className="mt-1 font-bold">Notifications are on</h2>
            <p className="font-semibold text-coin">+200 coins</p>
            <button type="button" className="btn-primary mt-4 w-full" onClick={() => setPrompt(null)}>Great</button>
          </div>
        )}
      </div>
    </div>
  );
}
