import { Suspense, useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import {
    Button,
    Dialog,
    FolderIcon,
    Skeleton,
    SUGGESTED_FOLDER_ICONS,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../../../shared/ui";
import { mainTabIcons } from "../lib/iconPicker";
import { useRecentFolderIcons, useSetFolderIcon } from "../queries";
import { AllIconsPanel } from "./AllIconsPanel";
import { IconOption } from "./IconOption";

type ChangeIconDialogProps = {
    folder: LibraryFolder;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function ChangeIconDialog({ folder, open, onOpenChange }: ChangeIconDialogProps) {
    const setIcon = useSetFolderIcon();
    const recentIcons = useRecentFolderIcons();
    const [selected, setSelected] = useState<string | null>(folder.customIcon);
    const tab = mainTabIcons(recentIcons.data ?? [], SUGGESTED_FOLDER_ICONS);

    const save = (icon: string | null) => {
        setIcon.mutate({ folder, icon }, { onSuccess: () => onOpenChange(false) });
    };

    const grid = (label: string, names: readonly string[]) => (
        <section className="flex flex-col gap-2">
            <h3 className="text-small font-medium text-text-muted">{label}</h3>
            <div role="radiogroup" aria-label={label} className="grid grid-cols-8 gap-1">
                {names.map((name) => (
                    <IconOption key={name} name={name} selected={selected === name} onSelect={setSelected}>
                        <FolderIcon name={name} />
                    </IconOption>
                ))}
            </div>
        </section>
    );

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Icon for ${folder.name}`}
            description="Shown next to the folder in the sidebar and on the home page."
            footer={
                <>
                    <Button variant="ghost" onClick={() => save(null)} disabled={setIcon.isPending}>
                        Use default icon
                    </Button>
                    <Button variant="primary" loading={setIcon.isPending} onClick={() => save(selected)}>
                        Save icon
                    </Button>
                </>
            }
        >
            <Tabs defaultValue="suggested" className="pb-2">
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
                        <AllIconsPanel selected={selected} onSelect={setSelected} />
                    </Suspense>
                </TabsContent>
            </Tabs>
        </Dialog>
    );
}
