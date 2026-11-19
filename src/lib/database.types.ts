// Hand-written to match supabase/migrations. Regenerate with `npm run db:types`
// once a local Supabase is running (it will overwrite this file).

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
};

export type BuildingTypeRow = {
  id: string;
  name: string;
  category: BuildingCategory;
  icon: string;
  description: string;
  cost: number;
  size: number;
  population: number;
  jobs: number;
  happiness: number;
  unlock_area: LifeArea | null;
  unlock_points: number | null;
  upgrades_to: string | null;
  sort_order: number;
};

export type PlacedBuildingRow = {
  id: string;
  user_id: string;
  type_id: string;
  x: number;
  y: number;
  price_paid: number;
  facing: "south" | "east" | "west" | "north" | null;
  created_at: string;
};

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
      profiles: Table<ProfileRow, Partial<ProfileRow>, Partial<Pick<ProfileRow, "display_name" | "timezone" | "city_name">>>;
      tasks: Table<
        TaskRow,
        Pick<TaskRow, "title" | "area"> & Partial<Pick<TaskRow, "difficulty" | "repeat" | "user_id" | "weekdays" | "times_per_period">>,
        Partial<Pick<TaskRow, "title" | "area" | "difficulty" | "repeat" | "archived_at" | "weekdays" | "times_per_period">>
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
      user_rewards: Table<{ user_id: string; reward: "home_screen" | "notifications"; coins: number; claimed_at: string }, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      complete_task: { Args: { p_task_id: string }; Returns: { coins: number; balance: number }[] };
      undo_task: { Args: { p_task_id: string }; Returns: { coins: number; balance: number }[] };
      buy_building: { Args: { p_type_id: string; p_x: number; p_y: number }; Returns: { building_id: string; balance: number }[] };
      move_building: { Args: { p_building_id: string; p_x: number; p_y: number }; Returns: undefined };
      sell_building: { Args: { p_building_id: string }; Returns: { refund: number; balance: number }[] };
      buy_tiles: { Args: { p_type_id: string; p_tiles: [number, number][] }; Returns: { built: number; cost: number; balance: number }[] };
      claim_reward: { Args: { p_reward: string }; Returns: { coins: number; balance: number }[] };
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string | null }; Returns: undefined };
      upgrade_building: { Args: { p_building_id: string }; Returns: { building_id: string; cost: number; balance: number }[] };
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
