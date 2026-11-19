/** Friendly text for the errors raised by the game's database functions. */
const MESSAGES: Record<string, string> = {
  not_signed_in: "Please sign in again.",
  task_not_found: "That task no longer exists.",
  task_archived: "That task is archived.",
  already_done: "Already done for now. Nice!",
  not_done: "There's nothing to undo.",
  not_scheduled_today: "That task isn't on today.",
  unknown_building: "That building doesn't exist.",
  locked: "That building is still locked. Finish more tasks in its life area.",
  lot_taken: "That spot is taken or outside your land.",
  not_enough_coins: "Not enough coins yet. Finish some tasks!",
  building_not_found: "That building is gone.",
  max_size: "Your city is already as big as it can get.",
  no_tiles: "Nothing selected.",
  bad_tiles: "Those tiles couldn't be read. Please try again.",
  too_many_tiles: "That's too long. Do it in shorter pieces (up to 200 tiles).",
};

export function gameError(error: { message?: string } | null | undefined): string {
  const key = error?.message?.trim() ?? "";
  return MESSAGES[key] ?? "Something went wrong. Please try again.";
}
