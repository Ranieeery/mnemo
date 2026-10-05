import { AlertDialog } from "radix-ui";
import { type ReactNode, useState } from "react";
import { cx } from "../lib/cx";
import { Button } from "./Button";
import { dialogPanelClasses, overlayClasses } from "./Dialog";

type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    /** Names the action, e.g. "Remove folder"; never a generic "OK". */
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
    /**
     * Runs the action. The dialog stays open with a busy button until it settles and closes on success; on failure it
     * stays open so the caller can report the error.
     */
    onConfirm: () => Promise<void> | void;
};

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel = "Cancel",
    tone = "default",
    onConfirm,
}: ConfirmDialogProps) {
    const [pending, setPending] = useState(false);

    const confirm = async () => {
        setPending(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } catch {
            // The caller reports the failure (usually with a toast); keep the dialog open for a retry.
        } finally {
            setPending(false);
        }
    };

    return (
        <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className={overlayClasses} />
                <AlertDialog.Content className={cx(dialogPanelClasses, "max-w-md gap-2 p-6")}>
                    <AlertDialog.Title className="text-title font-semibold">{title}</AlertDialog.Title>
                    <AlertDialog.Description className="text-body text-text-muted">
                        {description}
                    </AlertDialog.Description>
                    <div className="mt-4 flex justify-end gap-2">
                        <AlertDialog.Cancel asChild>
                            <Button disabled={pending}>{cancelLabel}</Button>
                        </AlertDialog.Cancel>
                        <Button variant={tone === "danger" ? "danger" : "primary"} loading={pending} onClick={confirm}>
                            {confirmLabel}
                        </Button>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
