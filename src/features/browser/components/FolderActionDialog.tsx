import { type FormEvent, useCallback, useState } from "react";
import type { FolderSummary } from "../../../shared/ipc/bindings";
import { Button, ConfirmDialog, Dialog, Input } from "../../../shared/ui";
import { useAddTagToFolder, useRemoveFolderTags, useSetFolderWatched } from "../queries";

export type FolderTarget = { path: string; name: string };
export type FolderAction = "markWatched" | "markUnwatched" | "addTag" | "removeTags";

type PendingAction = { action: FolderAction; target: FolderTarget; summary: FolderSummary };

/** Holds the folder action waiting for confirmation and renders its dialog. */
export function useFolderActionDialogs() {
    const [pending, setPending] = useState<PendingAction | null>(null);
    const request = useCallback(
        (action: FolderAction, target: FolderTarget, summary: FolderSummary) => setPending({ action, target, summary }),
        []
    );
    const dialog = pending && (
        <FolderActionDialog
            key={`${pending.action}:${pending.target.path}`}
            {...pending}
            onClose={() => setPending(null)}
        />
    );
    return { request, dialog };
}

type FolderActionDialogProps = PendingAction & { onClose: () => void };

function plural(count: number, noun: string) {
    return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function FolderActionDialog({ action, target, summary, onClose }: FolderActionDialogProps) {
    const setWatched = useSetFolderWatched();
    const removeTags = useRemoveFolderTags();
    const onOpenChange = (open: boolean) => !open && onClose();

    switch (action) {
        case "markWatched":
        case "markUnwatched": {
            const watched = action === "markWatched";
            const affected = watched ? summary.totalVideos - summary.watchedVideos : summary.watchedVideos;
            return (
                <ConfirmDialog
                    open
                    onOpenChange={onOpenChange}
                    title={`Mark ${plural(affected, "video")} as ${watched ? "watched" : "unwatched"}?`}
                    description={`Applies to every video in ${target.name} and its subfolders.`}
                    confirmLabel={watched ? "Mark as watched" : "Mark as unwatched"}
                    onConfirm={async () => {
                        await setWatched.mutateAsync({ path: target.path, watched });
                    }}
                />
            );
        }
        case "removeTags":
            return (
                <ConfirmDialog
                    open
                    onOpenChange={onOpenChange}
                    title={`Remove all tags from ${target.name}?`}
                    description={`${plural(summary.taggedVideos, "video")} in this folder and its subfolders lose their tags. The tags stay available for other videos.`}
                    confirmLabel="Remove tags"
                    tone="danger"
                    onConfirm={async () => {
                        await removeTags.mutateAsync({ path: target.path });
                    }}
                />
            );
        case "addTag":
            return <AddTagDialog target={target} videoCount={summary.totalVideos} onClose={onClose} />;
    }
}

function AddTagDialog({
    target,
    videoCount,
    onClose,
}: {
    target: FolderTarget;
    videoCount: number;
    onClose: () => void;
}) {
    const addTag = useAddTagToFolder();
    const [name, setName] = useState("");

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (name.trim()) {
            addTag.mutate({ path: target.path, name }, { onSuccess: onClose });
        }
    };

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={`Add a tag to ${target.name}`}
            description={`Every one of the ${plural(videoCount, "video")} in this folder and its subfolders gets the tag.`}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form="add-folder-tag"
                        loading={addTag.isPending}
                        disabled={!name.trim()}
                    >
                        Add tag
                    </Button>
                </>
            }
        >
            <form id="add-folder-tag" onSubmit={submit} className="pb-2">
                <Input
                    label="Tag"
                    placeholder="anime"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                />
            </form>
        </Dialog>
    );
}
