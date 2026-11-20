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
  Route,
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
  Volleyball,
  Warehouse,
  Waves,
  Flower2,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

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
  court: Volleyball,
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
  dirt_road: Route,
  road: Route,
  avenue: Route,
  bridge: Route,
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
  road: Route,
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
