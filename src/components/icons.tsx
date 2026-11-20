// One consistent line-icon set (Lucide) for the whole app: buildings, build-menu groups, life areas and common actions.
// Use these instead of emojis. Icons are decorative (aria-hidden) unless given a label.
import {
  Award,
  Backpack,
  BookOpen,
  Brain,
  Briefcase,
  Building,
  Building2,
  Bus,
  Castle,
  Clapperboard,
  Coffee,
  Coins,
  Construction,
  Droplets,
  Dumbbell,
  Factory,
  Flag,
  Flame,
  Frame,
  Fuel,
  Gem,
  GraduationCap,
  Hammer,
  HeartPulse,
  Home,
  Hospital,
  Hotel,
  House,
  Landmark,
  LandPlot,
  Package,
  PawPrint,
  Plane,
  School,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Siren,
  Sparkles,
  SquareParking,
  Stethoscope,
  Store,
  Tent,
  TrafficCone,
  TreePine,
  Trees,
  Trophy,
  Truck,
  Users,
  UtensilsCrossed,
  Warehouse,
  Waves,
  Flower2,
  Apple,
  Baby,
  Bed,
  Bike,
  CalendarDays,
  Camera,
  Car,
  Clock,
  Code,
  Dog,
  Footprints,
  Gamepad2,
  GlassWater,
  Guitar,
  Languages,
  Laptop,
  Mail,
  Moon,
  Mountain,
  Music,
  Palette,
  Pencil,
  Phone,
  PiggyBank,
  Pill,
  Salad,
  Smile,
  SprayCan,
  Sprout,
  Star,
  Sun,
  Target,
  Wallet,
  createLucideIcon,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// Road icons drawn in Lucide's style (24×24, 2px round strokes), seen from above, so each kind is easy to tell apart.
/** Dirt road: slightly uneven edges and a few pebbles, no markings. */
export const DirtRoadIcon = createLucideIcon("dirt-road", [
  ["path", { d: "M6 2l.6 7-.6 6 .4 7", key: "l" }],
  ["path", { d: "M18 2l-.4 6 .6 7-.6 7", key: "r" }],
  ["circle", { cx: "11", cy: "6", r: ".6", key: "p1" }],
  ["circle", { cx: "13.5", cy: "12", r: ".6", key: "p2" }],
  ["circle", { cx: "10.5", cy: "17.5", r: ".6", key: "p3" }],
]);
/** 2-lane road: straight edges and a dashed centre line. */
export const TwoLaneRoadIcon = createLucideIcon("two-lane-road", [
  ["path", { d: "M5 2v20", key: "l" }],
  ["path", { d: "M19 2v20", key: "r" }],
  ["path", { d: "M12 3v3", key: "d1" }],
  ["path", { d: "M12 10.5v3", key: "d2" }],
  ["path", { d: "M12 18v3", key: "d3" }],
]);
/** 4-lane road: wide, with a double centre line and dashed lane lines on each side. */
export const FourLaneRoadIcon = createLucideIcon("four-lane-road", [
  ["path", { d: "M2 2v20", key: "l" }],
  ["path", { d: "M22 2v20", key: "r" }],
  ["path", { d: "M10.5 2v20", key: "c1" }],
  ["path", { d: "M13.5 2v20", key: "c2" }],
  ["path", { d: "M6.25 3.5v3M6.25 10.5v3M6.25 17.5v3", key: "dl" }],
  ["path", { d: "M17.75 3.5v3M17.75 10.5v3M17.75 17.5v3", key: "dr" }],
]);
/** Basketball: a ball with the classic seams (a cross plus two curves), so it doesn't read as a volleyball. */
export const BasketballIcon = createLucideIcon("basketball", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "ball" }],
  ["path", { d: "M12 2v20", key: "v" }],
  ["path", { d: "M2 12h20", key: "h" }],
  ["path", { d: "M5 4.9c3.4 3.3 3.4 10.9 0 14.2", key: "l" }],
  ["path", { d: "M19 4.9c-3.4 3.3-3.4 10.9 0 14.2", key: "r" }],
]);
/** Bridge: a road deck over water. */
export const BridgeRoadIcon = createLucideIcon("bridge-road", [
  ["path", { d: "M2 10h20", key: "deck" }],
  ["path", { d: "M2 14h20", key: "deck2" }],
  ["path", { d: "M6 14v4M18 14v4", key: "piers" }],
  ["path", { d: "M2 21c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0", key: "water" }],
]);
import type { IconName } from "@/lib/task-icons";

/** The icons a task or goal can have (names in src/lib/task-icons.ts). */
export const CHOICE_ICONS: Record<IconName, LucideIcon> = {
  dumbbell: Dumbbell, footprints: Footprints, bike: Bike, "heart-pulse": HeartPulse, apple: Apple, salad: Salad, bed: Bed,
  "glass-water": GlassWater, pill: Pill, mountain: Mountain, brain: Brain, "book-open": BookOpen,
  "graduation-cap": GraduationCap, pencil: Pencil, languages: Languages, code: Code, briefcase: Briefcase, laptop: Laptop,
  mail: Mail, phone: Phone, "calendar-days": CalendarDays, clock: Clock, music: Music, guitar: Guitar, palette: Palette,
  camera: Camera, "gamepad-2": Gamepad2, sparkles: Sparkles, house: House, "spray-can": SprayCan,
  "shopping-cart": ShoppingCart, "utensils-crossed": UtensilsCrossed, coffee: Coffee, users: Users, baby: Baby, dog: Dog,
  sprout: Sprout, "tree-pine": TreePine, "flower-2": Flower2, hammer: Hammer, sun: Sun, moon: Moon, star: Star,
  target: Target, trophy: Trophy, "piggy-bank": PiggyBank, wallet: Wallet, car: Car, plane: Plane, smile: Smile,
};

const BUILDING: Record<string, LucideIcon> = {
  // Residential
  small_cottage: Tent,
  cottage: House,
  suburban: Home,
  house: Building,
  duplex: Building,
  apartments: Building2,
  luxury: Gem,
  highrise: Building2,
  // Commercial
  cafe: Coffee,
  corner_shop: Store,
  grocery: ShoppingCart,
  restaurant: UtensilsCrossed,
  clothing: Shirt,
  bank: Landmark,
  cinema: Clapperboard,
  hotel: Hotel,
  mall: ShoppingBag,
  office: Building2,
  // Industrial
  small_factory: Factory,
  workshop: Hammer,
  factory: Factory,
  warehouse: Warehouse,
  distribution: Truck,
  // Services
  city_hall: Landmark,
  police: Siren,
  fire_station: Flame,
  hospital: Hospital,
  clinic: Stethoscope,
  // Knowledge
  school: School,
  high_school: Backpack,
  university: GraduationCap,
  library: BookOpen,
  // Recreation
  park: Trees,
  court: BasketballIcon,
  garden: Flower2,
  central_park: Trees,
  community: Users,
  gym: Dumbbell,
  pool: Waves,
  stadium: Trophy,
  golf: LandPlot,
  museum: Frame,
  zoo: PawPrint,
  // Transport
  gas_station: Fuel,
  bus_station: Bus,
  parking: SquareParking,
  airport: Plane,
  // Landmarks
  monument: Award,
  // Roads and landscape
  dirt_road: DirtRoadIcon,
  road: TwoLaneRoadIcon,
  avenue: FourLaneRoadIcon,
  bridge: BridgeRoadIcon,
  tree: TreePine,
  water: Droplets,
};

const GROUP: Record<string, LucideIcon> = {
  residential: House,
  commercial: Store,
  industrial: Factory,
  service: Landmark,
  knowledge: GraduationCap,
  recreation: Trees,
  transport: Bus,
  landmark: Flag,
  road: TwoLaneRoadIcon,
  landscape: TreePine,
};

const AREA: Record<string, LucideIcon> = {
  health: HeartPulse,
  work: Briefcase,
  knowledge: Brain,
  personal: Sparkles,
};

type IconProps = Omit<LucideProps, "ref"> & { label?: string };

function render(Icon: LucideIcon, { label, className = "size-4", strokeWidth = 2, ...rest }: IconProps) {
  return (
    <Icon
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      {...rest}
    />
  );
}

/** The icon for a building type (falls back to a generic building). */
export function BuildingIcon({ id, ...props }: IconProps & { id: string }) {
  return render(BUILDING[id] ?? Castle, props);
}

/** The icon for a build-menu group. */
export function GroupIcon({ id, ...props }: IconProps & { id: string }) {
  return render(GROUP[id] ?? Building, props);
}

/** The icon for a life area (Health, Work, Knowledge, Personal). */
export function AreaIcon({ area, ...props }: IconProps & { area: string }) {
  return render(AREA[area] ?? Sparkles, props);
}

/** A task's or goal's chosen icon, or its life area's icon when none was chosen. */
export function ItemIcon({ icon, area, ...props }: Omit<IconProps, "name"> & { icon?: string | null; area?: string | null }) {
  const chosen = icon ? CHOICE_ICONS[icon as IconName] : undefined;
  return render(chosen ?? AREA[area ?? ""] ?? Target, props);
}

/** Coins: an amber coin stack. */
export function CoinIcon(props: IconProps) {
  return render(Coins, { className: "size-4 text-coin", ...props });
}

/** Bulldozer tool. */
export function BulldozeIcon(props: IconProps) {
  return render(Construction, props);
}

/** Generic package / road-cone icons used here and there. */
export const ConeIcon = (props: IconProps) => render(TrafficCone, props);
export const PackageIcon = (props: IconProps) => render(Package, props);
