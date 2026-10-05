import { Check, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Kbd, Progress, Skeleton, Tag, toast } from "../../../shared/ui";
import { CatalogSection, Specimen } from "./CatalogSection";

function useLoopingProgress() {
    const [value, setValue] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setValue((current) => (current >= 100 ? 0 : current + 5)), 400);
        return () => window.clearInterval(timer);
    }, []);
    return value;
}

export function FeedbackSection() {
    const progress = useLoopingProgress();
    const [tags, setTags] = useState(["anime", "favorites", "rewatch"]);

    return (
        <CatalogSection
            id="feedback"
            title="Feedback"
            description="Status, progress and the loading, empty and error states every async view has."
        >
            <Specimen label="Badges">
                <Badge>47:12</Badge>
                <Badge tone="success" icon={<Check />}>
                    Watched
                </Badge>
                <Badge tone="accent">New</Badge>
                <Badge tone="warning">Not processed</Badge>
                <Badge tone="danger">Missing</Badge>
            </Specimen>
            <Specimen label="Tags (removable)">
                {tags.map((tag) => (
                    <Tag key={tag} onRemove={() => setTags(tags.filter((current) => current !== tag))}>
                        {tag}
                    </Tag>
                ))}
                <Tag>read only</Tag>
            </Specimen>
            <Specimen label="Keyboard keys">
                <Kbd>Space</Kbd>
                <Kbd>K</Kbd>
                <Kbd>Alt</Kbd>
                <Kbd>←</Kbd>
            </Specimen>

            <div className="flex max-w-xl flex-col gap-4">
                <Specimen label={`Determinate: ${progress}%`}>
                    <Progress label="Processing videos" value={progress} />
                </Specimen>
                <Specimen label="Indeterminate">
                    <Progress label="Scanning folder" value={null} />
                </Specimen>
                <Specimen label="Thin, success (watch progress on a thumbnail)">
                    <Progress label="Folder progress" value={100} tone="success" size="thin" />
                </Specimen>
            </div>

            <Specimen label="Skeleton of a video card">
                <div className="flex w-56 flex-col gap-2" role="status" aria-label="Loading videos">
                    <Skeleton className="aspect-video w-full rounded-card" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            </Specimen>

            <Specimen label="Toasts">
                <Button
                    onClick={() => toast({ title: "Library exported", description: "Saved to mnemo-library.json" })}
                >
                    Info
                </Button>
                <Button
                    onClick={() =>
                        toast({
                            title: "Marked 12 videos as watched",
                            tone: "success",
                            action: { label: "Undo", onClick: () => toast({ title: "Undone" }) },
                        })
                    }
                >
                    Success with action
                </Button>
                <Button
                    onClick={() =>
                        toast({
                            title: "Could not import the library",
                            description: "The file was created by a newer version of Mnemo (format 3).",
                            tone: "danger",
                        })
                    }
                >
                    Error
                </Button>
            </Specimen>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-card border border-border">
                    <EmptyState
                        icon={FolderOpen}
                        title="No videos in this folder"
                        description="Add videos to this folder on disk, or open one of its subfolders."
                    />
                </div>
                <div className="rounded-card border border-border">
                    <ErrorState
                        title="ffmpeg is not installed"
                        message="Mnemo needs ffmpeg and ffprobe on the PATH to read durations and create thumbnails."
                        onRetry={() => toast({ title: "Checked again" })}
                        retryLabel="Check again"
                    />
                </div>
            </div>
        </CatalogSection>
    );
}
