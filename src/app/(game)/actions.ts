"use server";

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
    area: z.enum(["health", "work", "learning", "home", "social"], { message: "Choose a life area." }),
    difficulty: z.enum(["easy", "medium", "hard"]),
    repeat: z.enum(["once", "daily", "weekly", "monthly", "quarterly", "yearly", "days", "times_per_week", "times_per_month"]),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)),
    times: z.string().optional(),
  })
  .transform((v, ctx) => {
    const out = { title: v.title, area: v.area, difficulty: v.difficulty, repeat: v.repeat, weekdays: null as number[] | null, times_per_period: null as number | null };
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

export async function completeTask(taskId: string): Promise<ActionResult<{ coins: number; balance: number }>> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("complete_task", { p_task_id: taskId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins), balance: Number(data.balance) };
}

export async function undoTask(taskId: string): Promise<ActionResult<{ coins: number }>> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("undo_task", { p_task_id: taskId }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, coins: Number(data.coins) };
}

/**
 * Remove a task from the list. Tasks that were ever completed are archived instead of
 * deleted, so their completions keep counting toward building unlocks.
 */
export async function removeTask(taskId: string): Promise<ActionResult<{ archived: boolean }>> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("task_completions")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);
  const archive = (count ?? 0) > 0;
  const { error } = archive
    ? await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", taskId)
    : await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, archived: archive };
}

export async function restoreTask(taskId: string): Promise<ActionResult> {
  if (!uuid.safeParse(taskId).success) return { ok: false, error: gameError(null) };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tasks").update({ archived_at: null }).eq("id", taskId);
  if (error) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------

const coord = z.number().int().min(0).max(100);

export async function buyBuilding(typeId: string, x: number, y: number): Promise<ActionResult<{ id: string }>> {
  if (!/^[a-z_]{2,40}$/.test(typeId) || !coord.safeParse(x).success || !coord.safeParse(y).success) {
    return { ok: false, error: gameError(null) };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("buy_building", { p_type_id: typeId, p_x: x, p_y: y }).single();
  if (error || !data) return { ok: false, error: gameError(error) };
  refresh();
  return { ok: true, id: data.building_id };
}

export async function moveBuilding(buildingId: string, x: number, y: number): Promise<ActionResult> {
  if (!uuid.safeParse(buildingId).success || !coord.safeParse(x).success || !coord.safeParse(y).success) {
    return { ok: false, error: gameError(null) };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("move_building", { p_building_id: buildingId, p_x: x, p_y: y });
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
): Promise<ActionResult<{ id: string; startedAt: string; endsAt: string; serverNow: string }>> {
  const m = z.number().int().min(5).max(60).safeParse(minutes);
  if (!m.success) return { ok: false, error: gameError({ message: "bad_minutes" }) };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("start_focus", { p_minutes: m.data, p_label: label.trim().slice(0, 80) || null })
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
