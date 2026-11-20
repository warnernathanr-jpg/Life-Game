// Hand-written to match supabase/migrations. Regenerate with `npm run db:types`
// once a local Supabase is running (it will overwrite this file).

export type TimeOfDay = "morning" | "afternoon" | "night";
export type LifeArea = "health" | "work" | "knowledge" | "personal";
export type TaskDifficulty = "easy" | "medium" | "hard" | "epic";
export type TaskRepeat =
  | "once" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "days" | "times_per_week" | "times_per_month";
export type BuildingCategory = "residential" | "commercial" | "industrial" | "service" | "road" | "landscape";
export type LedgerKind = "task" | "task_undo" | "building" | "building_sold" | "land" | "bonus" | "focus";

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  timezone: string;
  city_name: string;
  city_size: number;
  land_purchases: number;
  created_at: string;
  /** Six-character code friends use to add this city. */
  city_code: string;
  /** The Getting started guide was skipped (or the player joined before it existed). */
  tutorial_hidden: boolean;
};

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  area: LifeArea;
  difficulty: TaskDifficulty;
  repeat: TaskRepeat;
  weekdays: number[] | null;
  times_per_period: number | null;
  archived_at: string | null;
  created_at: string;
  /** A Lucide icon name from src/lib/task-icons.ts (null: the life area's icon). */
  icon: string | null;
  /** One-off tasks only: the day it's due (YYYY-MM-DD), or null. */
  due_date: string | null;
  /** Daily / certain-days tasks: checked off once per listed time of day (null: once a day). */
  times_of_day: TimeOfDay[] | null;
};

export type GoalRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  area: LifeArea | null;
  icon: string | null;
  target_date: string;
  completed_at: string | null;
  created_at: string;
  /** Same tiers as tasks; reaching it pays ten times the tier (goal_reward()). */
  difficulty: TaskDifficulty;
  /** Bonus paid when reached (null: not reached). */
  reward_coins: number | null;
};

export type GoalStepRow = {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  position: number;
  done_at: string | null;
  created_at: string;
  /** Coins paid for checking it off (0 when not done). */
  coins: number;
  /** Pays what a task of this tier pays. */
  difficulty: TaskDifficulty;
};

export type BuildingTypeRow = {
  id: string;
  name: string;
  category: BuildingCategory;
  icon: string;
  description: string;
  cost: number;
  size: number;
  /** Footprint width (along x) and depth (along y); size = the larger. */
  w: number;
  d: number;
  population: number;
  jobs: number;
  happiness: number;
  unlock_area: LifeArea | null;
  unlock_points: number | null;
  upgrades_to: string | null;
  sort_order: number;
  /** Milestone landmarks: the population that makes it available (free, can't be bought). */
  milestone_population?: number | null;
};

export type PlacedBuildingRow = {
  id: string;
  user_id: string;
  type_id: string;
  x: number;
  y: number;
  price_paid: number;
  facing: "south" | "east" | "west" | "north" | null;
  /** Turned 90°: width and depth swapped. */
  rotated: boolean;
  /** Chosen color scheme (seed for the model's palettes); null = automatic from the id. */
  color_seed: number | null;
  created_at: string;
};

export type RoadControlKind = "stop" | "light";
export type RoadControlRow = { user_id: string; x: number; y: number; kind: RoadControlKind; price_paid: number; created_at: string };

export type LedgerRow = {
  id: number;
  user_id: string;
  amount: number;
  kind: LedgerKind;
  reason: string;
  task_id: string | null;
  building_id: string | null;
  created_at: string;
};

export type MyTaskRow = {
  id: string;
  title: string;
  area: LifeArea;
  difficulty: TaskDifficulty;
  repeat: TaskRepeat;
  weekdays: number[] | null;
  times_per_period: number | null;
  archived_at: string | null;
  created_at: string;
  reward: number;
  done: boolean;
  done_at: string | null;
  done_today: boolean;
  period_count: number;
  period_target: number;
  scheduled_today: boolean;
  total_completions: number;
  today: string;
  icon: string | null;
  due_date: string | null;
  times_of_day: TimeOfDay[] | null;
  /** Times of day already checked off today. */
  slots_done: TimeOfDay[];
};

export type FocusSessionRow = {
  id: string;
  user_id: string;
  minutes: number;
  label: string | null;
  started_at: string;
  ends_at: string;
  local_day: string;
  status: "running" | "completed" | "failed" | "abandoned";
  coins: number;
  area: LifeArea | null;
  points: number;
  finished_at: string | null;
};

export type ProgressRow = {
  balance: number;
  earned_today: number;
  health: number;
  work: number;
  knowledge: number;
  personal: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow>, Partial<Pick<ProfileRow, "display_name" | "timezone" | "city_name" | "tutorial_hidden">>>;
      tasks: Table<
        TaskRow,
        Pick<TaskRow, "title" | "area"> & Partial<Pick<TaskRow, "difficulty" | "repeat" | "user_id" | "weekdays" | "times_per_period" | "icon" | "due_date" | "times_of_day">>,
        Partial<Pick<TaskRow, "title" | "area" | "difficulty" | "repeat" | "archived_at" | "weekdays" | "times_per_period" | "icon" | "due_date" | "times_of_day">>
      >;
      goals: Table<
        GoalRow,
        Pick<GoalRow, "title" | "target_date"> & Partial<Pick<GoalRow, "notes" | "area" | "icon" | "difficulty">>,
        Partial<Pick<GoalRow, "title" | "notes" | "area" | "icon" | "target_date" | "difficulty">>
      >;
      goal_steps: Table<
        GoalStepRow,
        Pick<GoalStepRow, "goal_id" | "title"> & Partial<Pick<GoalStepRow, "position" | "difficulty">>,
        Partial<Pick<GoalStepRow, "title" | "position" | "difficulty">>
      >;
      task_completions: Table<{
        id: string;
        task_id: string | null;
        user_id: string;
        area: LifeArea;
        period_start: string;
        local_day: string;
        coins: number;
        points: number;
        bonus: number;
        title: string | null;
        completed_at: string;
      }, never, never>;
      coin_ledger: Table<LedgerRow, never, never>;
      building_types: Table<BuildingTypeRow, never, never>;
      placed_buildings: Table<PlacedBuildingRow, never, never>;
      focus_sessions: Table<FocusSessionRow, never, never>;
      road_controls: Table<RoadControlRow, never, never>;
      city_milestones: Table<{ user_id: string; population: number; coins: number; claimed_at: string }, never, never>;
      friendships: Table<{ user_id: string; friend_id: string; created_at: string }, never, never>;
      achievements: Table<{ user_id: string; id: string; achieved_at: string; seen: boolean; claimed_at: string | null }, never, never>;
      user_rewards: Table<{ user_id: string; reward: "home_screen" | "notifications"; coins: number; claimed_at: string }, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      complete_task: { Args: { p_task_id: string; p_slot?: TimeOfDay | null }; Returns: { coins: number; balance: number }[] };
      undo_task: { Args: { p_task_id: string; p_slot?: TimeOfDay | null }; Returns: { coins: number; balance: number }[] };
      buy_building: { Args: { p_type_id: string; p_x: number; p_y: number; p_rotated?: boolean }; Returns: { building_id: string; balance: number }[] };
      move_building: { Args: { p_building_id: string; p_x: number; p_y: number; p_rotated?: boolean | null }; Returns: undefined };
      sell_building: { Args: { p_building_id: string }; Returns: { refund: number; balance: number }[] };
      buy_tiles: { Args: { p_type_id: string; p_tiles: [number, number][] }; Returns: { built: number; cost: number; balance: number }[] };
      claim_reward: { Args: { p_reward: string }; Returns: { coins: number; balance: number }[] };
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null }; Returns: undefined };
      reset_progress: { Args: { p_confirm: string }; Returns: { balance: number }[] };
      complete_goal_step: { Args: { p_step_id: string }; Returns: { coins: number; balance: number }[] };
      undo_goal_step: { Args: { p_step_id: string }; Returns: { coins: number; balance: number }[] };
      delete_goal_step: { Args: { p_step_id: string }; Returns: { coins: number; balance: number }[] };
      complete_goal: { Args: { p_goal_id: string }; Returns: { coins: number; balance: number }[] };
      reopen_goal: { Args: { p_goal_id: string }; Returns: { coins: number; balance: number }[] };
      upgrade_building: { Args: { p_building_id: string }; Returns: { building_id: string; cost: number; balance: number }[] };
      place_road_control: { Args: { p_x: number; p_y: number; p_kind: RoadControlKind }; Returns: { cost: number; balance: number }[] };
      remove_road_control: { Args: { p_x: number; p_y: number }; Returns: { refund: number; balance: number }[] };
      claim_city_milestone: { Args: { p_population: number }; Returns: { coins: number; balance: number }[] };
      place_landmark: { Args: { p_type_id: string; p_x: number; p_y: number; p_rotated?: boolean }; Returns: { building_id: string }[] };
      my_city_population: { Args: Record<string, never>; Returns: number };
      add_friend: { Args: { p_code: string }; Returns: { friend_id: string; city_name: string; status: "friends" | "requested" }[] };
      accept_friend_request: { Args: { p_from: string }; Returns: undefined };
      drop_friend_request: { Args: { p_other: string }; Returns: undefined };
      my_friend_requests: { Args: Record<string, never>; Returns: { other_id: string; direction: "in" | "out"; display_name: string | null; city_name: string; city_size: number; population: number; created_at: string }[] };
      my_friends: { Args: Record<string, never>; Returns: { friend_id: string; city_name: string; city_code: string; city_size: number; population: number; buildings: number; display_name: string | null }[] };
      friend_city: { Args: { p_friend: string }; Returns: unknown };
      set_building_color: { Args: { p_building_id: string; p_seed: number | null }; Returns: undefined };
      set_building_facing: { Args: { p_building_id: string; p_facing: string | null }; Returns: undefined };
      buy_roads: { Args: { p_tiles: [number, number][] }; Returns: { built: number; cost: number; balance: number }[] };
      sell_buildings: { Args: { p_ids: string[] }; Returns: { sold: number; refund: number; balance: number }[] };
      start_focus: {
        Args: { p_minutes: number; p_label?: string | null; p_area?: LifeArea | null };
        Returns: { id: string; started_at: string; ends_at: string; server_now: string }[];
      };
      complete_focus: { Args: { p_id: string }; Returns: { coins: number; balance: number }[] };
      fail_focus: { Args: { p_id: string }; Returns: undefined };
      buy_land: { Args: Record<string, never>; Returns: { city_size: number; balance: number }[] };
      my_tutorial: { Args: Record<string, never>; Returns: { has_task: boolean; has_checkoff: boolean; has_road: boolean; has_home: boolean; has_resident: boolean; has_color: boolean; has_shop: boolean; hidden: boolean; claimed: boolean }[] };
      sync_achievements: { Args: Record<string, never>; Returns: number };
      mark_achievements_seen: { Args: Record<string, never>; Returns: undefined };
      my_achievement_coins: { Args: Record<string, never>; Returns: { badges: number; coins: number }[] };
      record_invite_shared: { Args: Record<string, never>; Returns: undefined };
      leaderboard: {
        Args: Record<string, never>;
        Returns: { rank: number; user_id: string; display_name: string | null; city_name: string; population: number; buildings: number; is_me: boolean }[];
      };
      claim_achievement: { Args: { p_id: string }; Returns: { coins: number; balance: number }[] };
      my_timeline: { Args: Record<string, never>; Returns: { at: string; kind: string; title: string; detail: string | null }[] };
      shift_city: { Args: { p_dx: number; p_dy: number }; Returns: undefined };
      my_progress: { Args: Record<string, never>; Returns: ProgressRow[] };
      my_tasks: { Args: Record<string, never>; Returns: MyTaskRow[] };
      land_price: { Args: { p_purchases: number }; Returns: number };
    };
    Enums: {
      life_area: LifeArea;
      task_difficulty: TaskDifficulty;
      task_repeat: TaskRepeat;
      building_category: BuildingCategory;
      ledger_kind: LedgerKind;
    };
    CompositeTypes: Record<string, never>;
  };
};
