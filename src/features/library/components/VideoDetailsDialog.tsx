import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { commands, type Video } from "../../../shared/ipc/bindings";
import { call, errorMessage } from "../../../shared/ipc/client";
import { queryKeys } from "../../../shared/ipc/queryKeys";
import { formatDuration } from "../../../shared/lib/formatDuration";
import { Button, Dialog, Input, Textarea, toast } from "../../../shared/ui";
import { replaceVideo } from "../../../shared/video";

type VideoDetailsDialogProps = {
    video: Video;
    onClose: () => void;
    /** Tag editor, composed in by the app so this feature does not depend on the tags feature. */
    tagsEditor: ReactNode;
};

function useUpdateDetails() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, title, description }: { id: number; title: string; description: string }) =>
            call(commands.updateVideoDetails(id, title, description)),
        onSuccess: async (updated) => {
            queryClient.setQueriesData({ queryKey: queryKeys.library }, (data: unknown) =>
                data === undefined ? data : replaceVideo(data, updated)
            );
            await queryClient.invalidateQueries({ queryKey: queryKeys.library });
            toast({ title: "Saved changes", tone: "success" });
        },
        onError: (error) => toast({ title: "Could not save", description: errorMessage(error), tone: "danger" }),
    });
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-text-subtle">{label}</dt>
            <dd className="text-small break-all text-text">{children}</dd>
        </div>
    );
}

/** Title and description editing, file information and the video's tags. */
export function VideoDetailsDialog({ video, onClose, tagsEditor }: VideoDetailsDialogProps) {
    const updateDetails = useUpdateDetails();
    const [title, setTitle] = useState(video.title);
    const [description, setDescription] = useState(video.description);
    const changed = title !== video.title || description !== video.description;
    const titleError = title.trim() ? undefined : "The title cannot be empty.";

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!titleError) {
            updateDetails.mutate({ id: video.id, title, description });
        }
    };

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onClose()}
            title="Video details"
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form="video-details-form"
                        loading={updateDetails.isPending}
                        disabled={!changed || Boolean(titleError)}
                    >
                        Save changes
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-6 pb-2">
                <form id="video-details-form" onSubmit={submit} className="flex flex-col gap-4">
                    <Input
                        label="Title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        error={titleError}
                    />
                    <Textarea
                        label="Description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        hint="Stored in the library only; the file is not changed."
                    />
                </form>
                {tagsEditor}
                <dl className="grid grid-cols-2 gap-4 rounded-card bg-surface p-4">
                    <Detail label="Duration">{formatDuration(video.durationSeconds)}</Detail>
                    <Detail label="Status">{video.isWatched ? "Watched" : "Not watched"}</Detail>
                    <div className="col-span-2">
                        <Detail label="File">{video.filePath}</Detail>
                    </div>
                </dl>
            </div>
        </Dialog>
    );
}
