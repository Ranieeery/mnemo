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
import { Suspense, use } from "react";
import { cx } from "../lib/cx";

/**
 * Icons suggested for library folders, always available. A folder can use any other lucide icon too; every icon is
 * stored by its lucide name in `library_folders.custom_icon`.
 */
const SUGGESTED_ICONS = {
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

export const SUGGESTED_FOLDER_ICONS: readonly string[] = Object.keys(SUGGESTED_ICONS);

function isSuggested(name: string): name is keyof typeof SUGGESTED_ICONS {
    return Object.hasOwn(SUGGESTED_ICONS, name);
}

/** Shaped like a lucide icon name. Rules out emojis saved by Mnemo 1.x, so they never load every icon. */
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let allIcons: Promise<ReadonlyMap<string, LucideIcon>> | undefined;

/** Every lucide icon by name. Loaded once, on demand, because the set is several hundred KB. */
export function loadAllIcons(): Promise<ReadonlyMap<string, LucideIcon>> {
    allIcons ??= import("./allIcons").then((module) => module.ALL_ICONS);
    return allIcons;
}

type FolderIconProps = {
    /** Stored icon name. Unknown values (such as emojis saved by Mnemo 1.x) fall back to the default folder icon. */
    name: string | null;
    className?: string;
};

export function FolderIcon({ name, className }: FolderIconProps) {
    const classes = cx("size-4 shrink-0", className);
    if (name !== null && isSuggested(name)) {
        const Icon = SUGGESTED_ICONS[name];
        return <Icon className={classes} aria-hidden />;
    }
    if (name !== null && ICON_NAME.test(name)) {
        return (
            <Suspense fallback={<Folder className={classes} aria-hidden />}>
                <AnyIcon name={name} className={classes} />
            </Suspense>
        );
    }
    return <Folder className={classes} aria-hidden />;
}

function AnyIcon({ name, className }: { name: string; className: string }) {
    const Icon = use(loadAllIcons()).get(name) ?? Folder;
    return <Icon className={className} aria-hidden />;
}
