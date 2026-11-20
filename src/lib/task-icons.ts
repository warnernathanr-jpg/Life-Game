// The icons a task or goal can have (Lucide icon names in kebab case). Shared by the server (validation) and the picker.
export const ICON_NAMES = [
  "dumbbell", "footprints", "bike", "heart-pulse", "apple", "salad", "bed", "glass-water", "pill", "mountain",
  "brain", "book-open", "graduation-cap", "pencil", "languages", "code", "briefcase", "laptop", "mail", "phone",
  "calendar-days", "clock", "music", "guitar", "palette", "camera", "gamepad-2", "sparkles", "house", "spray-can",
  "shopping-cart", "utensils-crossed", "coffee", "users", "baby", "dog", "sprout", "tree-pine", "flower-2", "hammer",
  "sun", "moon", "star", "target", "trophy", "piggy-bank", "wallet", "car", "plane", "smile",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const isIconName = (v: unknown): v is IconName => typeof v === "string" && (ICON_NAMES as readonly string[]).includes(v);
