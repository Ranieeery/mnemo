import { Eraser, Tags, Trash2, Unlink } from "lucide-react";
import { useRef, useState } from "react";
import type { TagWithUsage } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { plural } from "../../../shared/lib/plural";
import {
    Button,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    elementNear,
    IconButton,
    Skeleton,
    useFocusAfterRemoval,
} from "../../../shared/ui";
import { useAllTags, useDeleteAllTags, useDeleteTag, useDeleteUnusedTags, useRemoveTagFromAllVideos } from "../queries";
import { CreateTagForm } from "./CreateTagForm";

type PendingAction =
    | { kind: "delete"; tag: TagWithUsage }
    | { kind: "detach"; tag: TagWithUsage }
    | { kind: "deleteAll" }
    | { kind: "deleteUnused" };

/** Every tag with how many videos use it, and the cleanup actions. All of them ask for confirmation. */
export function TagManager() {
    const tags = useAllTags();
    const deleteTag = useDeleteTag();
    const detachTag = useRemoveTagFromAllVideos();
    const deleteAll = useDeleteAllTags();
    const deleteUnused = useDeleteUnusedTags();
    const [pending, setPending] = useState<PendingAction | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const focusAfterRemoval = useFocusAfterRemoval();

    // A deleted tag takes its row away: focus goes to the next row's delete button, or to the new tag field.
    const confirmDelete = (tag: TagWithUsage, index: number) => {
        focusAfterRemoval(
            () =>
                elementNear(listRef.current?.querySelectorAll<HTMLElement>("[data-delete-tag]"), index) ??
                containerRef.current?.querySelector("input")
        );
        setPending({ kind: "delete", tag });
    };

    if (tags.isPending) {
        return (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading tags">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        );
    }
    if (tags.isError) {
        return (
            <ErrorState
                title="Could not load the tags"
                message={errorMessage(tags.error)}
                onRetry={() => tags.refetch()}
            />
        );
    }
    if (tags.data.length === 0) {
        return (
            <div ref={containerRef} className="flex flex-col gap-4">
                <CreateTagForm />
                <EmptyState
                    icon={Tags}
                    title="No tags yet"
                    description="Create one above, add tags from a video's details, or tag a whole folder from its menu."
                />
            </div>
        );
    }

    const unused = tags.data.filter((tag) => tag.videoCount === 0).length;

    return (
        <div ref={containerRef} className="flex flex-col gap-4">
            <CreateTagForm />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body text-text-muted">
                    {plural(tags.data.length, "tag")}, {unused} unused
                </p>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        icon={<Eraser />}
                        disabled={unused === 0}
                        onClick={() => setPending({ kind: "deleteUnused" })}
                    >
                        Delete unused tags
                    </Button>
                    <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 />}
                        onClick={() => setPending({ kind: "deleteAll" })}
                    >
                        Delete all tags
                    </Button>
                </div>
            </div>
            <ul ref={listRef} className="flex flex-col divide-y divide-border rounded-card border border-border">
                {tags.data.map((tag, index) => (
                    <li key={tag.id} className="flex items-center gap-3 px-4 py-2">
                        <span className="min-w-0 flex-1 truncate text-body text-text">{tag.name}</span>
                        <span className="text-small text-text-muted tabular-nums">
                            {plural(tag.videoCount, "video")}
                        </span>
                        <IconButton
                            label={`Remove "${tag.name}" from all videos`}
                            icon={<Unlink />}
                            size="sm"
                            disabled={tag.videoCount === 0}
                            onClick={() => setPending({ kind: "detach", tag })}
                        />
                        <IconButton
                            label={`Delete tag "${tag.name}"`}
                            icon={<Trash2 />}
                            size="sm"
                            data-delete-tag
                            onClick={() => confirmDelete(tag, index)}
                        />
                    </li>
                ))}
            </ul>
            {pending && (
                <ConfirmDialog
                    open
                    onOpenChange={(open) => !open && setPending(null)}
                    tone={pending.kind === "deleteUnused" ? "default" : "danger"}
                    {...describe(pending, unused, tags.data.length)}
                    onConfirm={async () => {
                        switch (pending.kind) {
                            case "delete":
                                await deleteTag.mutateAsync(pending.tag);
                                break;
                            case "detach":
                                await detachTag.mutateAsync(pending.tag);
                                break;
                            case "deleteAll":
                                await deleteAll.mutateAsync();
                                break;
                            case "deleteUnused":
                                await deleteUnused.mutateAsync();
                                break;
                        }
                    }}
                />
            )}
        </div>
    );
}

function describe(pending: PendingAction, unused: number, total: number) {
    switch (pending.kind) {
        case "delete":
            return {
                title: `Delete tag "${pending.tag.name}"?`,
                description: `It is removed from ${plural(pending.tag.videoCount, "video")} and from the tag list.`,
                confirmLabel: "Delete tag",
            };
        case "detach":
            return {
                title: `Remove "${pending.tag.name}" from all videos?`,
                description: `${plural(pending.tag.videoCount, "video")} ${pending.tag.videoCount === 1 ? "loses" : "lose"} this tag. The tag stays in the list.`,
                confirmLabel: "Remove from videos",
            };
        case "deleteAll":
            return {
                title: `Delete all ${plural(total, "tag")}?`,
                description: "Every tag is removed from every video. This cannot be undone.",
                confirmLabel: "Delete all tags",
            };
        case "deleteUnused":
            return {
                title: `Delete ${plural(unused, "unused tag")}?`,
                description: "Only tags that no video uses are deleted.",
                confirmLabel: "Delete unused tags",
            };
    }
}
