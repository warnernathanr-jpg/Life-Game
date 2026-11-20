"use server";

import { isIconName } from "@/lib/task-icons";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { gameError } from "@/lib/errors";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  // The coin balance is in the shared header, so refresh every game page.
  revalidatePath("/", "layout");
}

const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type AddTaskState = { error?: string; added?: number };

const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a name.").max(120, "Keep it under 120 characters."),
    area: z.enum(["health", "work", "knowledge", "personal"], { message: "Choose a life area." }),
    difficulty: z.enum(["easy", "medium", "hard", "epic"]),
    repeat: z.enum(["once", "daily", "weekly", "monthly", "quarterly", "yearly", "days", "times_per_week", "times_per_month"]),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)),
    times: z.string().optional(),
    icon: z.string().optional(),
    due: z.string().optional(),
    slots: z.array(z.enum(["morning", "afternoon", "night"])).optional(),
  })
  .transform((v, ctx) => {
    const out = {
      title: v.title,
      area: v.area,
      difficulty: v.difficulty,
      repeat: v.repeat,
      weekdays: null as number[] | null,
      times_per_period: null as number | null,
      icon: isIconName(v.icon) ? v.icon : null,
      due_date: null as string | null,
      times_of_day: null as ("morning" | "afternoon" | "night")[] | null,
    };
    if ((v.repeat === "daily" || v.repeat === "days") && v.slots && v.slots.length > 0) {
      out.times_of_day = (["morning", "afternoon", "night"] as const).filter((t) => v.slots!.includes(t));
    }
    if (v.repeat === "once" && v.due) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.due) || Number.isNaN(Date.parse(`${v.due}T12:00:00Z`))) {
        ctx.addIssue({ code: "custom", message: "Pick a valid due date." });
        return z.NEVER;
      }
      out.due_date = v.due;
    }
    if (v.repeat === "days") {
      if (v.weekdays.length === 0) {
        ctx.addIssue({ code: "custom", message: "Pick at least one day." });
        return z.NEVER;
      }
      out.weekdays = [...new Set(v.weekdays)].sort();
    }
    if (v.repeat === "times_per_week" || v.repeat === "times_per_month") {
      const max = v.repeat === "times_per_week" ? 7 : 31;
      const n = Number(v.times);
      if (!Number.isInteger(n) || n < 2 || n > max) {
        ctx.addIssue({ code: "custom", message: `Choose between 2 and ${max} times a ${v.repeat === "times_per_week" ? "week" : "month"}.` });
        return z.NEVER;
      }
      out.times_per_period = n;
    }
    return out;
  });

export async function addTask(prev: AddTaskState, formData: FormData): Promise<AddTaskState> {
  const parsed = taskSchema.safeParse({
    title: formData.get("title") ?? "",
    area: formData.get("area"),
    difficulty: formData.get("difficulty"),
    repeat: formData.get("repeat"),
    weekdays: formData.getAll("weekdays"),
    times: formData.get("times") ?? undefined,
    icon: formData.get("icon") ?? undefined,
    due: formData.get("due") || undefined,
    slots: formData.getAll("times_of_day").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, added: prev.added };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tasks").insert(parsed.data);
  if (error) {
    console.error("addTask", error);
    return { error: "Couldn't save the task. Please try again.", added: prev.added };
  }
  refresh();
  return { added: (prev.added ?? 0) + 1 };
}

const TIMES = ["morning", "afternoon", "night"] as const;
const isTime = (v: unknown): v is (typeof TIMES)[number] => (TIMES as readonly unknown[]).includes(v);

export async function completeTask(taskId: string, slot?: "morning" | "afternoon" | "night"): Promise<ActionResult<{ coins: number; balance: number }>> {
  if (!uuid.safeParse(taskId).success || (slot !== undefined && !isTime(slot))) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("complete_task", slot ? { p_task_id: taskId, p_slot: slot } : { p_task_id: taskId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins), balance: Number(data.balance) };
}

export async function undoTask(taskId: string, slot?: "morning" | "afternoon" | "night"): Promise<ActionResult<{ coins: number }>> {
  if (!uuid.safeParse(taskId).success || (slot !== undefined && !isTime(slot))) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("undo_task", slot ? { p_task_id: taskId, p_slot: slot } : { p_task_id: taskId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins) };
}

/** Delete a task. Its past check-offs stay (they keep counting toward area points and show in the history calendar). */
export async function removeTask(taskId: string): Promise<ActionResult> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------

const coord = z.number().int().min(0).max(100);

export async function buyBuilding(typeId: string, x: number, y: number, rotated = false): Promise<ActionResult<{ id: string }>> {
  if (!/^[a-z_]{2,40}$/.test(typeId) || !coord.safeParse(x).success || !coord.safeParse(y).success) {
    return { ok: false, error: gameError(null) };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("buy_building", { p_type_id: typeId, p_x: x, p_y: y, p_rotated: rotated === true }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, id: data.building_id };
}

export async function moveBuilding(buildingId: string, x: number, y: number, rotated?: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(buildingId).success || !coord.safeParse(x).success || !coord.safeParse(y).success) {
    return { ok: false, error: gameError(null) };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("move_building", { p_building_id: buildingId, p_x: x, p_y: y, p_rotated: typeof rotated === "boolean" ? rotated : null });
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

export async function sellBuilding(buildingId: string): Promise<ActionResult<{ refund: number }>> {
  if (!uuid.safeParse(buildingId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("sell_building", { p_building_id: buildingId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, refund: Number(data.refund) };
}

const tiles = z.array(z.tuple([coord, coord])).min(1).max(200);

/** Paint road or landscape tiles (trees, water) along a stroke; tiles that already have that type are free. */
export async function buyTiles(
  typeId: string,
  points: [number, number][],
): Promise<ActionResult<{ built: number; cost: number }>> {
  if (!["dirt_road", "road", "avenue", "tree", "water"].includes(typeId)) return { ok: false, error: gameError(null) };
  const parsed = tiles.safeParse(points);
  if (!parsed.success) return { ok: false, error: gameError({ message: "too_many_tiles" }) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("buy_tiles", { p_type_id: typeId, p_tiles: parsed.data }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, built: data.built, cost: Number(data.cost) };
}

/** Upgrade a home in place (House → Townhome → Apartments) for the price difference. */
export async function upgradeBuilding(buildingId: string): Promise<ActionResult<{ cost: number }>> {
  if (!uuid.safeParse(buildingId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("upgrade_building", { p_building_id: buildingId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, cost: Number(data.cost) };
}

/** Turn a building to face another road (cosmetic). */
export async function setFacing(buildingId: string, facing: "south" | "east" | "west" | "north"): Promise<ActionResult> {
  if (!uuid.safeParse(buildingId).success || !["south", "east", "west", "north"].includes(facing)) {
    return { ok: false, error: gameError(null) };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_building_facing", { p_building_id: buildingId, p_facing: facing });
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

/** Put a stop sign or traffic light on a crossing (replacing the other kind if there is one). */
export async function placeRoadControl(x: number, y: number, kind: "stop" | "light"): Promise<ActionResult<{ cost: number }>> {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !["stop", "light"].includes(kind)) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("place_road_control", { p_x: x, p_y: y, p_kind: kind }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, cost: Number(data.cost) };
}

/** Take a stop sign or traffic light away (half its price back). */
export async function removeRoadControl(x: number, y: number): Promise<ActionResult<{ refund: number }>> {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("remove_road_control", { p_x: x, p_y: y }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, refund: Number(data.refund) };
}

/** Collect a population milestone's one-time bonus. */
export async function claimCityMilestone(population: number): Promise<ActionResult<{ coins: number }>> {
  if (![50, 100, 250, 500, 1000, 2500].includes(population)) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("claim_city_milestone", { p_population: population }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins) };
}

/** Place a milestone landmark (free, one each). */
export async function placeLandmark(typeId: string, x: number, y: number, rotated = false): Promise<ActionResult<{ id: string }>> {
  if (!/^[a-z_]{1,40}$/.test(typeId) || !coord.safeParse(x).success || !coord.safeParse(y).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("place_landmark", { p_type_id: typeId, p_x: x, p_y: y, p_rotated: rotated }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, id: String(data.building_id) };
}

/** Pick a building's color scheme (a seed for its palettes), or null for its automatic colors. Free. */
export async function setBuildingColor(buildingId: string, seed: number | null): Promise<ActionResult> {
  if (!uuid.safeParse(buildingId).success || (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295))) {
    return { ok: false, error: gameError(null) };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_building_color", { p_building_id: buildingId, p_seed: seed });
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

/** Buy road tiles along a stroke (tiles that are already road are free). */
export async function buyRoads(points: [number, number][]): Promise<ActionResult<{ built: number; cost: number }>> {
  const parsed = tiles.safeParse(points);
  if (!parsed.success) return { ok: false, error: gameError({ message: "too_many_tiles" }) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("buy_roads", { p_tiles: parsed.data }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, built: data.built, cost: Number(data.cost) };
}

/** Demolish several buildings/roads at once (half back each). */
export async function sellMany(ids: string[]): Promise<ActionResult<{ sold: number; refund: number }>> {
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: gameError({ message: "too_many_tiles" }) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("sell_buildings", { p_ids: parsed.data }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, sold: data.sold, refund: Number(data.refund) };
}

export async function buyLand(): Promise<ActionResult<{ size: number }>> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("buy_land").single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, size: data.city_size };
}

/** Slide the whole city one tile inside your land (free). */
export async function shiftCity(dx: number, dy: number): Promise<ActionResult> {
  if (![dx, dy].every(Number.isInteger) || Math.abs(dx) + Math.abs(dy) !== 1) return { ok: false, error: "Move one tile at a time." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("shift_city", { p_dx: dx, p_dy: dy });
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

export async function renameCity(name: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1, "Give your city a name.").max(40, "Keep it under 40 characters.").safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("profiles").update({ city_name: parsed.data }).eq("id", userId);
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Focus timer
// ---------------------------------------------------------------------------

export async function startFocus(
  minutes: number,
  label: string,
  area: string | null,
): Promise<ActionResult<{ id: string; startedAt: string; endsAt: string; serverNow: string }>> {
  const m = z.number().int().min(5).max(60).safeParse(minutes);
  if (!m.success) return { ok: false, error: gameError({ message: "bad_minutes" }) };
  const a = z.enum(["health", "work", "knowledge", "personal"]).nullable().safeParse(area);
  if (!a.success) return { ok: false, error: gameError({ message: "bad_area" }) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("start_focus", { p_minutes: m.data, p_label: label.trim().slice(0, 80) || null, p_area: a.data })
    .single();
  if (error || !data) return { ok: false, error: gameError(error) };
  return { ok: true, id: data.id, startedAt: data.started_at, endsAt: data.ends_at, serverNow: data.server_now };
}

export async function completeFocus(id: string): Promise<ActionResult<{ coins: number }> | { ok: false; error: string; tooEarly: true }> {
  if (!uuid.safeParse(id).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("complete_focus", { p_id: id }).single();
  if (error?.message === "focus_too_early") return { ok: false, error: gameError(error), tooEarly: true };
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: data.coins };
}

export async function failFocus(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("fail_focus", { p_id: id });
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// One-time rewards and notifications
// ---------------------------------------------------------------------------

export async function claimReward(reward: "home_screen" | "notifications" | "tutorial"): Promise<ActionResult<{ coins: number }>> {
  if (reward !== "home_screen" && reward !== "notifications" && reward !== "tutorial") return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("claim_reward", { p_reward: reward }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: data.coins };
}

/** The player shared or copied their invite link (earns the "Spread the word" badge the first time). */
export async function recordInviteShared(): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.rpc("record_invite_shared");
}

/** Collect one earned badge's coins (each badge is collected on its own). */
export async function claimAchievement(id: string): Promise<ActionResult<{ coins: number }>> {
  if (!ACHIEVEMENT_BY_ID.has(id)) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("claim_achievement", { p_id: id }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: data.coins };
}

/** Clear the "New" labels on earned badges (no page refresh: they stay visible until the next visit). */
export async function markAchievementsSeen(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_achievements_seen");
  if (error) return { ok: false, error: gameError(error) };
  return { ok: true };
}

/** Hide the Getting started guide. */
export async function hideTutorial(): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("profiles").update({ tutorial_hidden: true }).eq("id", userId);
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Save this device's push subscription (from PushSubscription.toJSON()). */
export async function savePushSubscription(subscription: unknown, userAgent: string): Promise<ActionResult> {
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "This browser's notification setup didn't work. Please try again." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) return { ok: false, error: gameError(error) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Goals (no coins: the owner writes them directly under RLS)
// ---------------------------------------------------------------------------

export type AddGoalState = { error?: string; added?: number };

const goalSchema = z.object({
  title: z.string().trim().min(1, "Give the goal a name.").max(120, "Keep it under 120 characters."),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date to reach it by."),
  area: z.enum(["health", "work", "knowledge", "personal", ""]).optional(),
  notes: z.string().trim().max(1000, "Keep notes under 1,000 characters.").optional(),
  steps: z
    .array(z.object({ title: z.string().trim().max(120, "Keep each step under 120 characters."), difficulty: z.enum(["easy", "medium", "hard", "epic"]).catch("easy") }))
    .max(30),
  icon: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard", "epic"]).optional(),
});

export async function addGoal(prev: AddGoalState, formData: FormData): Promise<AddGoalState> {
  const parsed = goalSchema.safeParse({
    title: formData.get("title") ?? "",
    target_date: formData.get("target_date") ?? "",
    area: formData.get("area") ?? "",
    notes: formData.get("notes") ?? "",
    steps: formData.getAll("step_title").map((t, i) => ({ title: String(t), difficulty: String(formData.getAll("step_difficulty")[i] ?? "easy") })),
    icon: formData.get("icon") ?? undefined,
    difficulty: formData.get("difficulty") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, added: prev.added };
  const v = parsed.data;
  const { supabase } = await requireUser();
  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      title: v.title,
      target_date: v.target_date,
      area: v.area ? v.area : null,
      notes: v.notes ? v.notes : null,
      icon: isIconName(v.icon) ? v.icon : null,
      difficulty: v.difficulty ?? "medium",
    })
    .select("id")
    .single();
  if (error || !goal) {
    console.error("addGoal", error);
    return { error: "Couldn't save the goal. Please try again.", added: prev.added };
  }
  // Each filled-in step field, in order, with its own difficulty.
  const steps = v.steps
    .filter((st) => st.title)
    .map((st, position) => ({ goal_id: goal.id, title: st.title, difficulty: st.difficulty, position }));
  if (steps.length > 0) {
    const { error: stepError } = await supabase.from("goal_steps").insert(steps);
    if (stepError) console.error("addGoal steps", stepError);
  }
  refresh();
  return { added: (prev.added ?? 0) + 1 };
}

export async function addGoalStep(goalId: string, title: string, difficulty: "easy" | "medium" | "hard" | "epic" = "easy"): Promise<ActionResult> {
  const clean = title.trim().slice(0, 120);
  if (!uuid.safeParse(goalId).success || !clean) return { ok: false, error: "Write the step first." };
  if (!["easy", "medium", "hard", "epic"].includes(difficulty)) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { count } = await supabase.from("goal_steps").select("id", { count: "exact", head: true }).eq("goal_id", goalId);
  const { error } = await supabase.from("goal_steps").insert({ goal_id: goalId, title: clean, position: count ?? 0, difficulty });
  if (error) return { ok: false, error: "Couldn't add the step." };
  refresh();
  return { ok: true };
}

/** Check a step off (+coins) or uncheck it (coins taken back). */
export async function setGoalStepDone(stepId: string, done: boolean): Promise<ActionResult<{ coins: number }>> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(done ? "complete_goal_step" : "undo_goal_step", { p_step_id: stepId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins) };
}

/** Delete a step (a checked step's coins are taken back). */
export async function deleteGoalStep(stepId: string): Promise<ActionResult<{ coins: number }>> {
  if (!uuid.safeParse(stepId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("delete_goal_step", { p_step_id: stepId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins) };
}

/** Mark a goal reached (+its bonus) or reopen it (bonus taken back). */
export async function setGoalDone(goalId: string, done: boolean): Promise<ActionResult<{ coins: number }>> {
  if (!uuid.safeParse(goalId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(done ? "complete_goal" : "reopen_goal", { p_goal_id: goalId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins) };
}

export async function deleteGoal(goalId: string): Promise<ActionResult> {
  if (!uuid.safeParse(goalId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  if (error) return { ok: false, error: "Couldn't delete the goal." };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Your name, shown with your city to friends. */
export async function setDisplayName(name: string): Promise<ActionResult> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("profiles").update({ display_name: clean || null }).eq("id", userId);
  if (error) return { ok: false, error: "Couldn't save your name." };
  refresh();
  return { ok: true };
}

/** Add a friend's city by its code. */
export async function addFriend(code: string): Promise<ActionResult<{ cityName: string; status: "friends" | "requested" }>> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(clean)) return { ok: false, error: "City codes are 6 letters and numbers." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("add_friend", { p_code: clean }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  revalidatePath("/friends");
  return { ok: true, cityName: data.city_name, status: data.status };
}

/** Accept a friend request: you become friends both ways. */
export async function acceptFriendRequest(fromId: string): Promise<ActionResult> {
  if (!uuid.safeParse(fromId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("accept_friend_request", { p_from: fromId });
  if (error) return { ok: false, error: "That request isn't there any more." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Decline a request to you, or take back one you sent. */
export async function dropFriendRequest(otherId: string): Promise<ActionResult> {
  if (!uuid.safeParse(otherId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("drop_friend_request", { p_other: otherId });
  if (error) return { ok: false, error: gameError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Stop following a friend's city. */
export async function removeFriend(friendId: string): Promise<ActionResult> {
  if (!uuid.safeParse(friendId).success) return { ok: false, error: gameError(null) };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("friendships").delete().eq("user_id", userId).eq("friend_id", friendId);
  if (error) return { ok: false, error: "Couldn't remove that friend." };
  revalidatePath("/friends");
  return { ok: true };
}

export type PasswordState = { error?: string; done?: number };

export async function changePassword(prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const pw = String(formData.get("password") ?? "");
  const again = String(formData.get("password2") ?? "");
  if (pw.length < 8) return { error: "Use at least 8 characters.", done: prev.done };
  if (pw.length > 72) return { error: "Use at most 72 characters.", done: prev.done };
  if (pw !== again) return { error: "The two passwords don't match.", done: prev.done };
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) {
    console.error("changePassword", error.message);
    return { error: error.message.includes("different") ? "Choose a password different from your current one." : "Couldn't change your password. Please try again.", done: prev.done };
  }
  return { done: (prev.done ?? 0) + 1 };
}

/** Start over: deletes all city, task, goal and coin history (the database checks the confirmation words). */
export async function resetProgress(confirmText: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reset_progress", { p_confirm: confirmText }).single();
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}
