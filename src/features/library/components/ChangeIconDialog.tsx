import { Suspense, useState } from "react";
import { FOLDER_COLORS, type FolderColor, type LibraryFolder } from "../../../shared/ipc/bindings";
import { capitalize } from "../../../shared/lib/capitalize";
import {
    Button,
    type ColorSwatch,
    ColorSwatches,
    Dialog,
    FolderIcon,
    folderColorValue,
    Skeleton,
    SUGGESTED_FOLDER_ICONS,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../../../shared/ui";
import { mainTabIcons } from "../lib/iconPicker";
import { useRecentFolderIcons, useSetFolderAppearance } from "../queries";
import { AllIconsPanel } from "./AllIconsPanel";
import { IconGrid } from "./IconGrid";

/** The swatch for no color: the icon keeps the text color it has today. */
const DEFAULT_COLOR = "default";
type ColorChoice = FolderColor | typeof DEFAULT_COLOR;

const COLOR_SWATCHES: readonly ColorSwatch<ColorChoice>[] = [
    { value: DEFAULT_COLOR, label: "Default", color: "var(--color-text-muted)" },
    ...FOLDER_COLORS.map((color) => ({ value: color, label: capitalize(color), color: folderColorValue(color) })),
];

type ChangeIconDialogProps = {
    folder: LibraryFolder;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/** Chooses a library folder's icon and its color, previewed as the sidebar shows it before saving. */
export function ChangeIconDialog({ folder, open, onOpenChange }: ChangeIconDialogProps) {
    const setAppearance = useSetFolderAppearance();
    const recentIcons = useRecentFolderIcons();
    const [selected, setSelected] = useState<string | null>(folder.customIcon);
    const [color, setColor] = useState<FolderColor | null>(folder.iconColor);
    const tab = mainTabIcons(recentIcons.data ?? [], SUGGESTED_FOLDER_ICONS);

    const save = (icon: string | null, iconColor: FolderColor | null) => {
        setAppearance.mutate({ folder, icon, color: iconColor }, { onSuccess: () => onOpenChange(false) });
    };

    const grid = (label: string, names: readonly string[]) => (
        <IconGrid label={label} names={names} selected={selected} onSelect={setSelected} color={color} />
    );

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Icon and color for ${folder.name}`}
            description="Shown next to the folder in the sidebar, on the home page and in Settings."
            footer={
                <>
                    <Button variant="ghost" onClick={() => save(null, null)} disabled={setAppearance.isPending}>
                        Reset to default
                    </Button>
                    <Button variant="primary" loading={setAppearance.isPending} onClick={() => save(selected, color)}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4 pb-2">
                {/* Drawn on the sidebar's own surface, as it will look there. */}
                <div
                    role="img"
                    aria-label={`Preview of ${folder.name} in the sidebar`}
                    className="flex h-12 items-center gap-2.5 rounded-card border border-border bg-surface px-4 text-body text-text-muted"
                >
                    <FolderIcon name={selected} color={color} className="size-5" />
                    <span className="truncate">{folder.name}</span>
                </div>
                <section className="flex flex-col gap-2">
                    <h3 className="text-small font-medium text-text-muted">Color</h3>
                    <ColorSwatches
                        label="Icon color"
                        value={color ?? DEFAULT_COLOR}
                        options={COLOR_SWATCHES}
                        onChange={(choice) => setColor(choice === DEFAULT_COLOR ? null : choice)}
                        ringOffsetClassName="ring-offset-surface-raised"
                    />
                </section>
                <Tabs defaultValue="suggested">
                    <TabsList>
                        <TabsTrigger value="suggested">Suggested</TabsTrigger>
                        <TabsTrigger value="all">All icons</TabsTrigger>
                    </TabsList>
                    <TabsContent value="suggested" className="flex flex-col gap-4">
                        {tab.recent.length > 0 && grid("Recently used", tab.recent)}
                        {grid("Suggested", tab.suggested)}
                    </TabsContent>
                    <TabsContent value="all">
                        <Suspense fallback={<Skeleton className="h-82 w-full" />}>
                            <AllIconsPanel selected={selected} onSelect={setSelected} color={color} />
                        </Suspense>
                    </TabsContent>
                </Tabs>
            </div>
        </Dialog>
    );
}
