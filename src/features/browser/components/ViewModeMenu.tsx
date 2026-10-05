import { FolderTree, ListVideo, RotateCcw } from "lucide-react";
import type { FolderViewMode, ResolvedViewMode } from "../../../shared/ipc/bindings";
import { baseName } from "../../../shared/lib/paths";
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../../shared/ui";
import { useSetViewMode } from "../queries";

const modeLabels: Record<FolderViewMode, string> = {
    folders: "Folders",
    continuous: "Continuous",
};

const modeDescriptions: Record<FolderViewMode, string> = {
    folders: "This folder's own videos; subfolders open separately.",
    continuous: "Every video below this folder, grouped by subfolder. Playback continues into the next one.",
};

type ViewModeMenuProps = {
    path: string;
    viewMode: ResolvedViewMode;
};

export function ViewModeMenu({ path, viewMode }: ViewModeMenuProps) {
    const setViewMode = useSetViewMode();
    const isExplicit = viewMode.definedAt === path;
    const inheritedFrom = viewMode.definedAt && !isExplicit ? baseName(viewMode.definedAt) : null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    icon={viewMode.mode === "continuous" ? <ListVideo /> : <FolderTree />}
                    loading={setViewMode.isPending}
                >
                    {modeLabels[viewMode.mode]}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>
                    {inheritedFrom ? `View inherited from ${inheritedFrom}` : "How this folder lists videos"}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={viewMode.mode}
                    onValueChange={(mode) => {
                        if (mode === "folders" || mode === "continuous") {
                            setViewMode.mutate({ path, mode });
                        }
                    }}
                >
                    {(["folders", "continuous"] as const).map((mode) => (
                        <DropdownMenuRadioItem key={mode} value={mode} className="h-auto items-start py-2">
                            <span className="flex flex-col gap-0.5">
                                <span>{modeLabels[mode]}</span>
                                <span className="text-small text-text-muted">{modeDescriptions[mode]}</span>
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                {isExplicit && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            icon={<RotateCcw />}
                            onSelect={() => setViewMode.mutate({ path, mode: null })}
                        >
                            Use the parent folder's view
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
