// Hand-written to match supabase/migrations. Regenerate with `npm run db:types`
// once a local Supabase is running (it will overwrite this file).

export type LifeArea = "health" | "work" | "learning" | "home" | "social";
export type TaskDifficulty = "easy" | "medium" | "hard";
export type TaskRepeat = "once" | "daily" | "weekly";
export type BuildingCategory = "residential" | "commercial" | "industrial" | "service";
export type LedgerKind = "task" | "task_undo" | "building" | "building_sold" | "land" | "bonus";

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
  unlock_count: number | null;
  sort_order: number;
};

export type PlacedBuildingRow = {
  id: string;
  user_id: string;
  type_id: string;
  x: number;
  y: number;
  price_paid: number;
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
  archived_at: string | null;
  created_at: string;
  reward: number;
  done: boolean;
  done_at: string | null;
  done_today: boolean;
  total_completions: number;
};

export type ProgressRow = {
  balance: number;
  earned_today: number;
  health: number;
  work: number;
  learning: number;
  home: number;
  social: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow>, Partial<Pick<ProfileRow, "display_name" | "timezone" | "city_name">>>;
      tasks: Table<
        TaskRow,
        Pick<TaskRow, "title" | "area"> & Partial<Pick<TaskRow, "difficulty" | "repeat" | "user_id">>,
        Partial<Pick<TaskRow, "title" | "area" | "difficulty" | "repeat" | "archived_at">>
      >;
      task_completions: Table<{
        id: string;
        task_id: string;
        user_id: string;
        area: LifeArea;
        period_start: string;
        local_day: string;
        coins: number;
        completed_at: string;
      }, never, never>;
      coin_ledger: Table<LedgerRow, never, never>;
      building_types: Table<BuildingTypeRow, never, never>;
      placed_buildings: Table<PlacedBuildingRow, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      complete_task: { Args: { p_task_id: string }; Returns: { coins: number; balance: number }[] };
      undo_task: { Args: { p_task_id: string }; Returns: { coins: number; balance: number }[] };
      buy_building: { Args: { p_type_id: string; p_x: number; p_y: number }; Returns: { building_id: string; balance: number }[] };
      move_building: { Args: { p_building_id: string; p_x: number; p_y: number }; Returns: undefined };
      sell_building: { Args: { p_building_id: string }; Returns: { refund: number; balance: number }[] };
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
