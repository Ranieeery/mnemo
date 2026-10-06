import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import type { FolderSummary } from "../../../shared/ipc/bindings";
import { Button, Dialog } from "../../../shared/ui";
import { showInFileManager } from "../../../shared/video";
import type { FolderTarget } from "./FolderActionDialog";

function Property({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-text-subtle">{label}</dt>
            <dd className="text-small break-all text-text tabular-nums">{children}</dd>
        </div>
    );
}

type FolderPropertiesDialogProps = {
    target: FolderTarget;
    summary: FolderSummary;
    onClose: () => void;
};

/** Where a folder is and what it contains (counts include its subfolders). */
export function FolderPropertiesDialog({ target, summary, onClose }: FolderPropertiesDialogProps) {
    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={target.name}
            description="Counts include every subfolder."
            footer={
                <>
                    <Button icon={<FolderOpen />} onClick={() => showInFileManager(target.path)}>
                        Show in file manager
                    </Button>
                    <Button variant="primary" onClick={onClose}>
                        Close
                    </Button>
                </>
            }
        >
            <dl className="grid grid-cols-3 gap-4 pb-2">
                <div className="col-span-3">
                    <Property label="Location">{target.path}</Property>
                </div>
                <Property label="Videos">{summary.totalVideos}</Property>
                <Property label="Watched">{summary.watchedVideos}</Property>
                <Property label="Tagged">{summary.taggedVideos}</Property>
            </dl>
        </Dialog>
    );
}
