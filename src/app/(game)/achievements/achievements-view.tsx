// The Achievements page's badges and timeline (data comes from the page; kept separate so it can be previewed).
import { Award, Building2, CalendarCheck, Check, Coins, Compass, Flag, Hammer, Handshake, Hourglass, Landmark, LandPlot, ListChecks, ListPlus, Lock, Share2, Medal, Repeat, Rocket, Sprout, Target, Timer, Trophy, Users, type LucideIcon } from "lucide-react";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, ACHIEVEMENT_GROUPS, CITY_GROUP, coinsToCollect, type Achievement } from "@/lib/achievements";
import { CollectButton } from "./collect-button";
import { formatCoins } from "@/lib/game";
import { MarkSeen } from "./mark-seen";

const ICONS: Record<string, LucideIcon> = {
  check: Check, "list-checks": ListChecks, rocket: Rocket, "calendar-check": CalendarCheck, repeat: Repeat, compass: Compass,
  target: Target, trophy: Trophy, timer: Timer, hourglass: Hourglass, sprout: Sprout, hammer: Hammer, "building-2": Building2,
  users: Users, landmark: Landmark, "land-plot": LandPlot, handshake: Handshake, "list-plus": ListPlus, flag: Flag, "share-2": Share2,
};

export type TimelineRow = { at: string; kind: string; title: string; detail: string | null };

function timelineText(r: TimelineRow): { Icon: LucideIcon; text: string } {
  switch (r.kind) {
    case "achievement":
      return { Icon: Award, text: `Earned “${ACHIEVEMENT_BY_ID.get(r.title)?.title ?? r.title}”` };
    case "goal":
      return { Icon: Trophy, text: `Reached a goal: ${r.title}` };
    case "habit":
      return { Icon: Medal, text: `Habit milestone on “${r.title}”${r.detail ? ` (+${formatCoins(Number(r.detail))} coins)` : ""}` };
    case "milestone":
      return { Icon: Users, text: `${formatCoins(Number(r.title))} people live in your city` };
    case "land":
      return { Icon: LandPlot, text: r.title.replace(/^Bought land/, "Bought more land") };
    default:
      return { Icon: Flag, text: "Started your city" };
  }
}

export type EarnedBadge = { id: string; achieved_at: string; seen: boolean; claimed_at?: string | null };

/** The badges and the timeline (also used to preview the page with sample data). */
export function AchievementsView({ earned, timeline, tz }: { earned: EarnedBadge[]; timeline: TimelineRow[]; tz: string }) {
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
  const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "long", year: "numeric" });
  const byId = new Map(earned.map((e) => [e.id, e]));
  const onPage = ACHIEVEMENTS.filter((a) => a.group !== CITY_GROUP);
  const count = onPage.filter((a) => byId.has(a.id)).length;
  const toCollect = coinsToCollect(earned.map((e) => ({ id: e.id, claimed_at: e.claimed_at ?? null })), "page");
  const rows = timeline;
  const months: { label: string; rows: TimelineRow[] }[] = [];
  for (const r of rows) {
    const label = month(r.at);
    if (months.at(-1)?.label !== label) months.push({ label, rows: [] });
    months.at(-1)!.rows.push(r);
  }

  return (
    <>
      {earned.some((e) => !e.seen) && <MarkSeen />}
      <section className="card" aria-labelledby="badges-h">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="badges-h" className="font-semibold">Badges</h2>
          <p className="text-sm text-muted">{count} of {onPage.length} earned</p>
        </div>
        {toCollect.coins > 0 && (
          <p className="mt-2 rounded-lg bg-coin/15 px-3 py-2 text-sm">
            <span className="font-semibold text-coin">{formatCoins(toCollect.coins)} coins</span> waiting on {toCollect.badges} badge
            {toCollect.badges === 1 ? "" : "s"}. Tap Collect on each one.
          </p>
        )}
        <div className="mt-2 h-1.5 rounded-full bg-raised" aria-hidden>
          <div className="h-full rounded-full bg-coin" style={{ width: `${(count / onPage.length) * 100}%` }} />
        </div>
        {ACHIEVEMENT_GROUPS.map((group) => (
          <div key={group} className="mt-5">
            <h3 className="text-sm font-semibold text-muted">{group}</h3>
            <BadgeGrid list={ACHIEVEMENTS.filter((a) => a.group === group)} earned={earned} tz={tz} />
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="timeline-h">
        <h2 id="timeline-h" className="font-semibold">Your timeline</h2>
        <p className="text-xs text-muted">Everything you&apos;ve achieved, newest first. It&apos;s all kept for good.</p>
        {months.map((m) => (
          <div key={m.label} className="mt-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{m.label}</h3>
            <ol className="mt-2 space-y-2 border-l-2 border-line pl-4">
              {m.rows.map((r, i) => {
                const { Icon, text } = timelineText(r);
                return (
                  <li key={`${r.kind}-${r.at}-${i}`} className="relative">
                    <span aria-hidden className="absolute top-0.5 -left-[25px] flex size-4 items-center justify-center rounded-full bg-accent text-on-accent">
                      <Icon className="size-2.5" />
                    </span>
                    <p className="text-sm break-words">{text}</p>
                    <p className="text-xs text-muted">{date(r.at)}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </>
  );
}

/** A grid of badges (earned in gold with Collect / collected, locked ones grey), smallest reward first. */
export function BadgeGrid({ list, earned, tz }: { list: Achievement[]; earned: EarnedBadge[]; tz: string }) {
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
  const byId = new Map(earned.map((e) => [e.id, e]));
  return (
    <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.sort((x, y) => x.coins - y.coins).map((a) => {
        const got = byId.get(a.id);
        const Icon = ICONS[a.icon] ?? Award;
        return (
          <li key={a.id} className={`relative rounded-xl p-3 ring-1 ${got ? "bg-raised ring-coin/50" : "ring-line"}`}>
            {got && !got.seen && <span className="absolute top-2 right-2 rounded-full bg-coin px-1.5 text-[10px] font-bold text-on-coin">New</span>}
            <span aria-hidden className={`flex size-10 items-center justify-center rounded-full ${got ? "bg-coin text-on-coin" : "bg-raised text-faint"}`}>
              {got ? <Icon className="size-5" /> : <Lock className="size-4" />}
            </span>
            <p className={`mt-2 text-sm font-semibold break-words ${got ? "" : "text-muted"}`}>{a.title}</p>
            <p className="text-xs break-words text-muted">{a.description}</p>
            {got && !got.claimed_at ? (
              <CollectButton id={a.id} coins={a.coins} />
            ) : (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-muted">
                <Coins className="size-3" aria-hidden />
                {got ? `${formatCoins(a.coins)} collected` : `${formatCoins(a.coins)} coins`}
              </p>
            )}
            {got && <p className="text-[11px] text-coin">Earned {date(got.achieved_at)}</p>}
            <span className="sr-only">{got ? "Earned" : "Not earned yet"}</span>
          </li>
        );
      })}
    </ul>
  );
}
