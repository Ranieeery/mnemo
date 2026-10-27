import { errorMessage } from "../../../shared/ipc/client";
import { Tag } from "../../../shared/ui";
import { useVideoTags } from "../queries";

/** The tags of a video, read only (they are edited in its details). Nothing while loading or when it has none. */
export function VideoTagList({ videoId }: { videoId: number }) {
    const tags = useVideoTags(videoId);

    if (tags.isError) {
        return <p className="text-small text-danger-text">Could not load the tags: {errorMessage(tags.error)}</p>;
    }
    if (!tags.data || tags.data.length === 0) {
        return null;
    }
    return (
        <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            {tags.data.map((tag) => (
                <li key={tag.id}>
                    <Tag tone="filled">{tag.name}</Tag>
                </li>
            ))}
        </ul>
    );
}
