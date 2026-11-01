import type { ChecklistItem, HuntStatus } from "@/lib/planner-schema";

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const STATUS_OPTIONS: { value: HuntStatus; label: string; color: string }[] = [
  { value: "planning", label: "Planning", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "applied", label: "Applied", color: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "drawn", label: "Drawn", color: "bg-green-100 text-green-800 border-green-300" },
  { value: "alternate", label: "Alternate", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "not-drawn", label: "Not Drawn", color: "bg-red-100 text-red-800 border-red-300" },
];

export const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

export const BUDGET_CATEGORIES = ["License", "Tag/Permit", "Application fee", "Points", "Travel", "Lodging", "Gear", "Processing", "Taxidermy", "Other"];

const DEFAULT_CHECKLIST: Omit<ChecklistItem, "id">[] = [
  { category: "Weapons & Ammo", label: "Primary weapon", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Ammunition / Arrows", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Cleaning kit", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Sling / Bow case", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Rangefinder", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Optics / Scope", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Binoculars", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Spotting scope + tripod", checked: false, custom: false },
  { category: "Clothing", label: "Base layers", checked: false, custom: false },
  { category: "Clothing", label: "Insulation layer", checked: false, custom: false },
  { category: "Clothing", label: "Outer shell / rain gear", checked: false, custom: false },
  { category: "Clothing", label: "Camo / blaze orange", checked: false, custom: false },
  { category: "Clothing", label: "Hunting boots", checked: false, custom: false },
  { category: "Clothing", label: "Gloves", checked: false, custom: false },
  { category: "Clothing", label: "Hat / beanie", checked: false, custom: false },
  { category: "Clothing", label: "Extra socks", checked: false, custom: false },
  { category: "Camping", label: "Tent / shelter", checked: false, custom: false },
  { category: "Camping", label: "Sleeping bag", checked: false, custom: false },
  { category: "Camping", label: "Sleeping pad", checked: false, custom: false },
  { category: "Camping", label: "Camp stove + fuel", checked: false, custom: false },
  { category: "Camping", label: "Cooler / ice", checked: false, custom: false },
  { category: "Camping", label: "Food / water", checked: false, custom: false },
  { category: "Camping", label: "Headlamp + batteries", checked: false, custom: false },
  { category: "Camping", label: "Camp chair", checked: false, custom: false },
  { category: "Safety", label: "First aid kit", checked: false, custom: false },
  { category: "Safety", label: "Bear spray (if applicable)", checked: false, custom: false },
  { category: "Safety", label: "Emergency blanket", checked: false, custom: false },
  { category: "Safety", label: "Whistle / signal mirror", checked: false, custom: false },
  { category: "Safety", label: "Fire starter", checked: false, custom: false },
  { category: "Navigation", label: "GPS unit / app", checked: false, custom: false },
  { category: "Navigation", label: "Paper maps (unit/topo)", checked: false, custom: false },
  { category: "Navigation", label: "Compass", checked: false, custom: false },
  { category: "Navigation", label: "Phone charger / battery", checked: false, custom: false },
  { category: "Processing", label: "Knives (skinning + boning)", checked: false, custom: false },
  { category: "Processing", label: "Game bags", checked: false, custom: false },
  { category: "Processing", label: "Rope / paracord", checked: false, custom: false },
  { category: "Processing", label: "Latex gloves", checked: false, custom: false },
  { category: "Processing", label: "Pack frame / game cart", checked: false, custom: false },
  { category: "Processing", label: "Cooler for meat transport", checked: false, custom: false },
];

export const CHECKLIST_CATEGORIES = [...new Set(DEFAULT_CHECKLIST.map((i) => i.category))];

export function defaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST.map((item) => ({ ...item, id: generateId() }));
}
