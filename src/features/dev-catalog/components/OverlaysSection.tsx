import { Check, Eye, FolderOpen, Info, Play, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import {
    Button,
    Card,
    ConfirmDialog,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
    Dialog,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
    Input,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    toast,
} from "../../../shared/ui";
import { CatalogSection, Specimen } from "./CatalogSection";

const speeds = ["0.5", "0.75", "1", "1.25", "1.5", "2"];

const failFirstConfirm = (() => {
    let attempts = 0;
    return async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        attempts += 1;
        if (attempts % 2 === 1) {
            toast({ title: "Could not remove the folder", description: "Try again.", tone: "danger" });
            throw new Error("demo failure");
        }
        toast({ title: "Folder removed", tone: "success" });
    };
})();

export function OverlaysSection() {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [dangerOpen, setDangerOpen] = useState(false);
    const [speed, setSpeed] = useState("1");

    return (
        <CatalogSection
            id="overlays"
            title="Overlays and structure"
            description="Dialogs, menus, tabs and cards. Menus open from the keyboard too (Enter, or Shift+F10 for context menus)."
        >
            <Specimen label="Dialogs">
                <Button onClick={() => setDetailsOpen(true)}>Video details</Button>
                <Button onClick={() => setConfirmOpen(true)}>Confirm a bulk action</Button>
                <Button variant="danger" onClick={() => setDangerOpen(true)}>
                    Confirm a destructive action
                </Button>
            </Specimen>
            <Dialog
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                title="Video details"
                description="Title and description are stored in the library; the file is not renamed."
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setDetailsOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={() => setDetailsOpen(false)}>
                            Save changes
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4 pb-2">
                    <Input label="Title" defaultValue="Pilot" />
                    <Input label="Description" defaultValue="Walter White starts a new career." />
                </div>
            </Dialog>
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Mark 12 videos as watched?"
                description="Every video in Season 1 and its subfolders will be marked as watched."
                confirmLabel="Mark as watched"
                onConfirm={() => {
                    toast({ title: "Marked 12 videos as watched", tone: "success" });
                }}
            />
            <ConfirmDialog
                open={dangerOpen}
                onOpenChange={setDangerOpen}
                title="Remove Series from the library?"
                description="Its 340 videos, tags and watch history are removed from Mnemo. Files on disk are not touched. (Demo: fails on the first attempt.)"
                confirmLabel="Remove folder"
                tone="danger"
                onConfirm={failFirstConfirm}
            />

            <Specimen label="Dropdown menu with a choice">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button>Speed {speed}×</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={speed} onValueChange={setSpeed}>
                            {speeds.map((value) => (
                                <DropdownMenuRadioItem key={value} value={value}>
                                    {value}×
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Specimen>

            <Specimen label="Context menu (right-click the area)">
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex h-24 w-72 items-center justify-center rounded-card border border-dashed border-border-strong text-small text-text-muted"
                        >
                            Right-click or press Shift+F10
                        </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        <ContextMenuLabel>S01E03.mkv</ContextMenuLabel>
                        <ContextMenuItem icon={<Play />}>Play</ContextMenuItem>
                        <ContextMenuItem icon={<Check />} shortcut="W">
                            Mark as watched
                        </ContextMenuItem>
                        <ContextMenuItem icon={<TagIcon />}>Edit details and tags</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem icon={<Eye />}>Open in default player</ContextMenuItem>
                        <ContextMenuItem icon={<FolderOpen />}>Show in file manager</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem icon={<Trash2 />} tone="danger">
                            Remove all tags
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Specimen>

            <div className="grid gap-6 md:grid-cols-2">
                <Tabs defaultValue="library" className="max-w-md">
                    <TabsList>
                        <TabsTrigger value="library">Library</TabsTrigger>
                        <TabsTrigger value="tags">Tags</TabsTrigger>
                        <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                    </TabsList>
                    <TabsContent value="library" className="text-body text-text-muted">
                        Folders, import and export.
                    </TabsContent>
                    <TabsContent value="tags" className="text-body text-text-muted">
                        Rename, delete and clean up tags.
                    </TabsContent>
                    <TabsContent value="maintenance" className="text-body text-text-muted">
                        Database information and orphaned videos.
                    </TabsContent>
                </Tabs>
                <Card className="flex max-w-md flex-col gap-2 p-5">
                    <div className="flex items-center gap-2 text-body font-medium text-text">
                        <Info className="size-4 text-text-muted" aria-hidden />
                        Library statistics
                    </div>
                    <p className="text-body text-text-muted">1,284 videos, 812 watched, 3 folders.</p>
                </Card>
            </div>
        </CatalogSection>
    );
}
