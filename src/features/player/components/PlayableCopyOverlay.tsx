import { ExternalLink, FileVideo } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { formatBytes } from "../../../shared/lib/formatBytes";
import { Button, ErrorState, Spinner, Switch } from "../../../shared/ui";
import type { PlayableSource } from "../hooks/usePlayableSource";

type PlayableCopyOverlayProps = {
    source: PlayableSource;
    onAnswer: (accepted: boolean, remember: boolean) => void;
    onMakeCopy: () => void;
    onCancel: () => void;
    onOpenExternally: () => void;
};

const UNSUPPORTED = "Its format is not supported by the built-in player. It may still play in another app.";

/** Covers the video while it cannot play as it is: the question, the copy being made, or why it cannot play. */
export function PlayableCopyOverlay({
    source,
    onAnswer,
    onMakeCopy,
    onCancel,
    onOpenExternally,
}: PlayableCopyOverlayProps) {
    switch (source.kind) {
        case "original":
        case "copy":
            return null;
        case "checking":
            return (
                <Cover>
                    <Spinner className="size-6 text-text-muted" label="Checking the video" />
                </Cover>
            );
        case "asking":
            return (
                <Cover>
                    <CopyQuestion
                        container={source.check.container}
                        sizeBytes={source.check.sizeBytes}
                        onAnswer={onAnswer}
                        onOpenExternally={onOpenExternally}
                    />
                </Cover>
            );
        case "preparing":
            return (
                <Cover>
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                        <Spinner className="size-6 text-text-muted" />
                        <div role="status" className="flex flex-col gap-1">
                            <p className="text-title font-semibold text-text">Making a playable copy…</p>
                            <p className="text-body text-text-muted">
                                The video is copied as it is, without re-encoding. It plays as soon as it's ready.
                            </p>
                        </div>
                        <Button onClick={onCancel}>Cancel</Button>
                    </div>
                </Cover>
            );
        case "unplayable":
            return (
                <Cover>
                    <ErrorState title="This video can't be played here" message={source.reason ?? UNSUPPORTED}>
                        <div className="mt-2 flex flex-wrap justify-center gap-2">
                            {source.canCopy && <Button onClick={onMakeCopy}>Make playable copy</Button>}
                            <Button icon={<ExternalLink />} onClick={onOpenExternally}>
                                Open in default player
                            </Button>
                        </div>
                    </ErrorState>
                </Cover>
            );
    }
}

function Cover({ children }: { children: ReactNode }) {
    return <div className="absolute inset-0 flex items-center justify-center bg-backdrop p-4">{children}</div>;
}

type CopyQuestionProps = {
    container: string;
    sizeBytes: number;
    onAnswer: (accepted: boolean, remember: boolean) => void;
    onOpenExternally: () => void;
};

function CopyQuestion({ container, sizeBytes, onAnswer, onOpenExternally }: CopyQuestionProps) {
    const [remember, setRemember] = useState(false);
    const titleId = useId();
    return (
        <section
            aria-labelledby={titleId}
            className="flex w-full max-w-lg animate-pop-in flex-col gap-4 rounded-card bg-surface-raised p-5 shadow-overlay"
        >
            <div className="flex gap-3">
                <FileVideo className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
                <div className="flex flex-col gap-1.5">
                    <h2 id={titleId} className="text-title font-semibold text-text">
                        Play from a playable copy?
                    </h2>
                    <p className="text-body text-text-muted">
                        This file is stored as {container}, which the built-in player can't open, but the video inside
                        it can play. Mnemo can copy it into an MP4 without re-encoding: same quality, about{" "}
                        {formatBytes(sizeBytes)} of disk space.
                    </p>
                    <p className="text-small text-text-muted">
                        Copies are deleted after 30 days without use, or sooner when they pass the limit set in Settings
                        &gt; Playback. The original file is never changed.
                    </p>
                </div>
            </div>
            <Switch label="Remember my choice" checked={remember} onCheckedChange={setRemember} />
            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    icon={<ExternalLink />}
                    onClick={() => {
                        onAnswer(false, remember);
                        onOpenExternally();
                    }}
                >
                    Open in default player
                </Button>
                <Button onClick={() => onAnswer(false, remember)}>Not now</Button>
                <Button variant="primary" onClick={() => onAnswer(true, remember)}>
                    Make playable copy
                </Button>
            </div>
        </section>
    );
}
