import { open } from "@tauri-apps/plugin-dialog";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RelocationCheck } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { useFolderName } from "../../../shared/ipc/queries";
import { plural } from "../../../shared/lib/plural";
import { Button, Dialog, Spinner, toast } from "../../../shared/ui";
import { useFolderRelocationCheck, useRelocateFolder } from "../queries";

type RelocateFolderDialogProps = {
    /** The unreachable library folder. */
    from: string;
    onClose: () => void;
};

/**
 * Locates a library folder that was moved, renamed or whose drive got another letter: the folder picker opens
 * first (cancelling it closes everything), then the dialog shows how many of its videos are at the chosen folder
 * before anything changes. Files are never moved.
 */
export function RelocateFolderDialog({ from, onClose }: RelocateFolderDialogProps) {
    const name = useFolderName(from);
    const [to, setTo] = useState<string | null>(null);
    const check = useFolderRelocationCheck(from, to);
    const relocate = useRelocateFolder();
    const pickedOnOpen = useRef(false);

    /** Asks for the folder; cancelling the first pick closes the dialog, later ones keep the current choice. */
    const pick = async (first: boolean) => {
        try {
            const selected = await open({ directory: true, multiple: false, title: `Locate ${name}` });
            if (typeof selected === "string") {
                relocate.reset();
                setTo(selected);
            } else if (first) {
                onClose();
            }
        } catch (error) {
            toast({ title: "Could not open the folder picker", description: errorMessage(error), tone: "danger" });
            if (first) {
                onClose();
            }
        }
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: the picker opens once, when the dialog is asked for.
    useEffect(() => {
        if (!pickedOnOpen.current) {
            pickedOnOpen.current = true;
            void pick(true);
        }
    }, []);

    if (to === null) {
        return null;
    }
    const result = check.data;
    const unconvincing = result && (result.quality === "poor" || result.quality === "none");

    return (
        <Dialog
            open
            onOpenChange={(open) => !open && !relocate.isPending && onClose()}
            title={`Locate ${name}`}
            description="Mnemo only updates where it looks for this folder. Files are never moved."
            footer={
                <>
                    <Button onClick={onClose} disabled={relocate.isPending}>
                        Cancel
                    </Button>
                    {(check.isError || (result && result.quality !== "complete" && result.quality !== "empty")) && (
                        <Button onClick={() => void pick(false)} disabled={relocate.isPending}>
                            Choose another folder…
                        </Button>
                    )}
                    {result && (
                        <Button
                            variant="primary"
                            loading={relocate.isPending}
                            onClick={() => relocate.mutate({ from, to }, { onSuccess: onClose })}
                        >
                            {unconvincing ? "Use anyway" : "Use this folder"}
                        </Button>
                    )}
                </>
            }
        >
            <div className="flex flex-col gap-4 pb-2">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
                    <dt className="text-text-subtle">Was</dt>
                    <dd className="break-all text-text-muted">{from}</dd>
                    <dt className="text-text-subtle">Now</dt>
                    <dd className="break-all text-text">{to}</dd>
                </dl>
                {check.isPending && (
                    <p role="status" className="flex items-center gap-2 text-body text-text-muted">
                        <Spinner />
                        Looking for the videos of {name}…
                    </p>
                )}
                {check.isError && (
                    <Notice tone="danger" title="This folder can't be used" detail={errorMessage(check.error)} />
                )}
                {result && <CheckResult name={name} result={result} />}
                {relocate.isError && (
                    <Notice
                        tone="danger"
                        title="Could not locate the folder"
                        detail={`${errorMessage(relocate.error)} Nothing was changed.`}
                    />
                )}
            </div>
        </Dialog>
    );
}

function CheckResult({ name, result }: { name: string; result: RelocationCheck }) {
    const { totalVideos, foundVideos, differentVideos, quality } = result;
    if (quality === "empty") {
        return (
            <Notice
                tone="success"
                title={`${name} has no videos yet`}
                detail="Its videos are read from the new location."
            />
        );
    }
    const found = `${foundVideos} of ${plural(totalVideos, "video")} found`;
    const different =
        differentVideos > 0
            ? ` ${plural(differentVideos, "file")} with the same name ${differentVideos === 1 ? "has" : "have"} a different size.`
            : "";
    if (quality === "complete") {
        return <Notice tone="success" title={found} detail="Every video keeps its progress, tags and history." />;
    }
    if (quality === "partial") {
        return (
            <Notice
                tone="success"
                title={found}
                detail={`The others keep their data and are listed as missing until they show up.${different}`}
            />
        );
    }
    return (
        <Notice
            tone="warning"
            title={quality === "none" ? `None of the ${plural(totalVideos, "video")} found` : `Only ${found}`}
            detail={`This may not be the same folder. Videos not found keep their data and are listed as missing.${different}`}
        />
    );
}

const noticeIcons = {
    success: <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />,
    warning: <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />,
    danger: <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />,
};

function Notice({ tone, title, detail }: { tone: keyof typeof noticeIcons; title: string; detail: string }) {
    return (
        <div role={tone === "success" ? "status" : "alert"} className="flex items-start gap-3">
            {noticeIcons[tone]}
            <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-body font-medium text-text">{title}</p>
                <p className="text-small text-text-muted">{detail}</p>
            </div>
        </div>
    );
}
