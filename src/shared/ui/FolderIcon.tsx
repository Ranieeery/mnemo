import {
    Anchor,
    Baby,
    BookOpen,
    Briefcase,
    Camera,
    Car,
    Cat,
    Clapperboard,
    Code,
    Dog,
    Drama,
    Dumbbell,
    Film,
    Flame,
    Folder,
    Gamepad2,
    Ghost,
    Globe,
    GraduationCap,
    Heart,
    House,
    Laugh,
    Leaf,
    type LucideIcon,
    Mic,
    Moon,
    Mountain,
    Music,
    Palette,
    Plane,
    Popcorn,
    Rocket,
    Shield,
    Skull,
    Sparkles,
    Star,
    Sun,
    Swords,
    Trophy,
    Tv,
    Users,
    Video,
    Zap,
} from "lucide-react";
import { cx } from "../lib/cx";

/** Icons a library folder can use, stored by name in `library_folders.custom_icon`. */
export const FOLDER_ICONS = {
    film: Film,
    clapperboard: Clapperboard,
    popcorn: Popcorn,
    tv: Tv,
    video: Video,
    camera: Camera,
    drama: Drama,
    laugh: Laugh,
    ghost: Ghost,
    skull: Skull,
    swords: Swords,
    rocket: Rocket,
    sparkles: Sparkles,
    star: Star,
    heart: Heart,
    flame: Flame,
    zap: Zap,
    shield: Shield,
    trophy: Trophy,
    dumbbell: Dumbbell,
    "gamepad-2": Gamepad2,
    music: Music,
    mic: Mic,
    palette: Palette,
    "graduation-cap": GraduationCap,
    "book-open": BookOpen,
    code: Code,
    briefcase: Briefcase,
    baby: Baby,
    users: Users,
    house: House,
    globe: Globe,
    plane: Plane,
    car: Car,
    anchor: Anchor,
    mountain: Mountain,
    leaf: Leaf,
    sun: Sun,
    moon: Moon,
    dog: Dog,
    cat: Cat,
} satisfies Record<string, LucideIcon>;

export type FolderIconName = keyof typeof FOLDER_ICONS;

export function isFolderIconName(value: string | null): value is FolderIconName {
    return value !== null && Object.hasOwn(FOLDER_ICONS, value);
}

type FolderIconProps = {
    /** Stored icon name. Unknown values (such as emojis saved by Mnemo 1.x) fall back to the default folder icon. */
    name: string | null;
    className?: string;
};

export function FolderIcon({ name, className }: FolderIconProps) {
    const Icon = isFolderIconName(name) ? FOLDER_ICONS[name] : Folder;
    return <Icon className={cx("size-4 shrink-0", className)} aria-hidden />;
}
