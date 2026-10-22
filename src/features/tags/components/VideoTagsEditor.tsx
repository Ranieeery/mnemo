import { Plus } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { MAX_TAG_NAME_CHARS } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { Button, elementNear, Input, Skeleton, Tag, useFocusAfterRemoval } from "../../../shared/ui";
import { useAddTagToVideo, useAllTags, useRemoveTagFromVideo, useVideoTags } from "../queries";

/** Most-used tags offered as one-click suggestions. */
const SUGGESTION_COUNT = 12;

export function VideoTagsEditor({ videoId }: { videoId: number }) {
    const videoTags = useVideoTags(videoId);
    const allTags = useAllTags();
    const addTag = useAddTagToVideo(videoId);
    const removeTag = useRemoveTagFromVideo(videoId);
    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const tagsRef = useRef<HTMLUListElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const focusAfterRemoval = useFocusAfterRemoval();

    // A removed tag or a used suggestion leaves the list: focus goes to its neighbor, or to the field when none is left.
    const remove = (tagId: number, index: number) => {
        focusAfterRemoval(() => elementNear(tagsRef.current?.querySelectorAll("button"), index) ?? inputRef.current);
        removeTag.mutate(tagId);
    };
    const addSuggestion = (tagName: string, index: number) => {
        focusAfterRemoval(
            () => elementNear(suggestionsRef.current?.querySelectorAll("button"), index) ?? inputRef.current
        );
        addTag.mutate(tagName);
    };

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
                <p role="alert" className="text-small text-danger-text">
                    Could not load the tags: {errorMessage(videoTags.error)}
                </p>
            )}
            {videoTags.data && (
                <ul ref={tagsRef} aria-label="Tags of this video" className="flex flex-wrap gap-1.5">
                    {videoTags.data.length === 0 && <li className="text-small text-text-subtle">No tags yet.</li>}
                    {videoTags.data.map((tag, index) => (
                        <li key={tag.id}>
                            <Tag onRemove={() => remove(tag.id, index)}>{tag.name}</Tag>
                        </li>
                    ))}
                </ul>
            )}
            <form onSubmit={submit} className="flex items-end gap-2">
                <Input
                    ref={inputRef}
                    label="Add a tag"
                    hideLabel
                    placeholder="Add a tag"
                    value={name}
                    maxLength={MAX_TAG_NAME_CHARS}
                    onChange={(event) => setName(event.target.value)}
                    className="flex-1"
                />
                <Button type="submit" icon={<Plus />} loading={addTag.isPending} disabled={!name.trim()}>
                    Add
                </Button>
            </form>
            {suggestions.length > 0 && (
                <div ref={suggestionsRef} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-small text-text-subtle">Existing tags:</span>
                    {suggestions.map((tag, index) => (
                        <button
                            key={tag.id}
                            type="button"
                            onClick={() => addSuggestion(tag.name, index)}
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
