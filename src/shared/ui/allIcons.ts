import { icons, type LucideIcon } from "lucide-react";

/**
 * Lucide's kebab-case name for one of its export names ("Gamepad2" → "gamepad-2", "AArrowDown" → "a-arrow-down",
 * "Grid2x2" → "grid-2x2"). Folder icons are stored by this name.
 */
export function iconNameOf(exportName: string): string {
    return exportName
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
        .replace(/(?<!\d[xX])(?<=[A-Za-z])(?=\d)/g, "-")
        .toLowerCase();
}

/** Every lucide icon by name, alphabetically. Several hundred KB: only ever load this module with `import()`. */
export const ALL_ICONS: ReadonlyMap<string, LucideIcon> = new Map(
    Object.entries(icons)
        .map(([exportName, icon]) => [iconNameOf(exportName), icon] as const)
        .sort(([a], [b]) => a.localeCompare(b))
);
