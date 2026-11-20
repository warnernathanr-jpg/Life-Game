// The icons a task or goal can have (Lucide icon names in kebab case), in groups for the picker. Shared by the server
// (validation) and the picker. Only add names: saved tasks and goals keep the name they were given.
export const ICON_GROUPS = [
  { label: "Health & fitness", icons: ["dumbbell", "footprints", "bike", "heart-pulse", "activity", "waves", "person-standing", "apple", "salad", "carrot", "egg", "glass-water", "droplets", "pill", "syringe", "stethoscope", "bed", "alarm-clock", "scale", "flame", "snowflake", "eye", "shield-plus", "hand-heart"] },
  { label: "Mind & learning", icons: ["brain", "book-open", "library", "notebook-pen", "graduation-cap", "pencil", "languages", "lightbulb", "microscope", "calculator", "atom", "puzzle", "newspaper", "headphones", "glasses", "feather", "quote", "crown"] },
  { label: "Work & money", icons: ["briefcase", "laptop", "code", "mail", "phone", "inbox", "presentation", "chart-line", "file-text", "folder", "clipboard-list", "list-checks", "kanban", "printer", "megaphone", "handshake", "receipt", "credit-card", "banknote", "landmark", "piggy-bank", "wallet", "chart-pie", "badge-dollar-sign"] },
  { label: "Home & chores", icons: ["house", "spray-can", "washing-machine", "shirt", "trash-2", "recycle", "wrench", "hammer", "paintbrush", "scissors", "key", "lamp", "sofa", "bath", "shopping-cart", "package", "utensils-crossed", "chef-hat", "cooking-pot", "refrigerator", "coffee"] },
  { label: "People & pets", icons: ["users", "user-round", "baby", "heart", "gift", "cake", "party-popper", "message-circle", "phone-call", "church", "dog", "cat", "paw-print", "fish", "bird", "smile"] },
  { label: "Hobbies & fun", icons: ["music", "guitar", "piano", "mic", "headset", "palette", "brush", "camera", "film", "tv", "drama", "gamepad-2", "dice-5", "ticket", "popcorn", "book-heart", "sparkles", "volleyball", "trophy", "medal"] },
  { label: "Nature & travel", icons: ["sprout", "leaf", "flower-2", "tree-pine", "mountain", "sun", "moon", "cloud-sun", "umbrella", "tent", "sailboat", "car", "bus", "train-front", "plane", "map", "compass", "globe"] },
  { label: "Time & goals", icons: ["calendar-days", "calendar-check", "clock", "hourglass", "timer", "bell", "target", "flag", "rocket", "zap", "star", "award", "circle-check", "list-todo", "repeat", "infinity"] },
] as const;

export const ICON_NAMES = ICON_GROUPS.flatMap((g) => g.icons);

export type IconName = (typeof ICON_GROUPS)[number]["icons"][number];

export const isIconName = (v: unknown): v is IconName => typeof v === "string" && (ICON_NAMES as readonly string[]).includes(v);
