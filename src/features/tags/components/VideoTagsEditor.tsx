import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../../shared/ipc/client";
import { Button, Input, Skeleton, Tag } from "../../../shared/ui";
import { useAddTagToVideo, useAllTags, useRemoveTagFromVideo, useVideoTags } from "../queries";

/** Most-used tags offered as one-click suggestions. */
const SUGGESTION_COUNT = 12;

export function VideoTagsEditor({ videoId }: { videoId: number }) {
    const videoTags = useVideoTags(videoId);
    const allTags = useAllTags();
    const addTag = useAddTagToVideo(videoId);
    const removeTag = useRemoveTagFromVideo(videoId);
    const [name, setName] = useState("");

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (name.trim()) {
            addTag.mutate(name, { onSuccess: () => setName("") });
        }
    };

    const assigned = new Set(videoTags.data?.map((tag) => tag.id));
    const suggestions = (allTags.data ?? [])
        .filter((tag) => !assigned.has(tag.id))
        .sort((a, b) => b.videoCount - a.videoCount)
        .slice(0, SUGGESTION_COUNT);

    return (
        <section aria-labelledby="video-tags-heading" className="flex flex-col gap-3">
            <h3 id="video-tags-heading" className="text-body font-medium text-text">
                Tags
            </h3>
            {videoTags.isPending && <Skeleton className="h-6 w-48" />}
            {videoTags.isError && (
                <p role="alert" className="text-small text-danger">
                    Could not load the tags: {errorMessage(videoTags.error)}
                </p>
            )}
            {videoTags.data && (
                <ul aria-label="Tags of this video" className="flex flex-wrap gap-1.5">
                    {videoTags.data.length === 0 && <li className="text-small text-text-subtle">No tags yet.</li>}
                    {videoTags.data.map((tag) => (
                        <li key={tag.id}>
                            <Tag onRemove={() => removeTag.mutate(tag.id)}>{tag.name}</Tag>
                        </li>
                    ))}
                </ul>
            )}
            <form onSubmit={submit} className="flex items-end gap-2">
                <Input
                    label="Add a tag"
                    hideLabel
                    placeholder="Add a tag"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="flex-1"
                />
                <Button type="submit" icon={<Plus />} loading={addTag.isPending} disabled={!name.trim()}>
                    Add
                </Button>
            </form>
            {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-small text-text-subtle">Existing tags:</span>
                    {suggestions.map((tag) => (
                        <button
                            key={tag.id}
                            type="button"
                            onClick={() => addTag.mutate(tag.name)}
                            aria-label={`Add tag ${tag.name}`}
                            className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-small text-text-muted hover:border-text-muted hover:text-text"
                        >
                            {tag.name}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
