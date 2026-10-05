import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { IconButton } from "./IconButton";

export type DialogSize = "sm" | "md" | "lg";

const sizeClasses: Record<DialogSize, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
};

export const overlayClasses =
    "fixed inset-0 z-40 bg-overlay data-[state=open]:animate-appear data-[state=closed]:animate-disappear";

export const dialogPanelClasses = cx(
    "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
    "rounded-dialog bg-surface-raised text-text shadow-dialog",
    "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
);

type DialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    /** Actions row at the bottom, usually buttons aligned to the end. */
    footer?: ReactNode;
    size?: DialogSize;
    children?: ReactNode;
};

export function Dialog({ open, onOpenChange, title, description, footer, size = "md", children }: DialogProps) {
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className={overlayClasses} />
                <DialogPrimitive.Content
                    className={cx(dialogPanelClasses, sizeClasses[size])}
                    // Without a description, Radix must not point aria-describedby at a missing element.
                    {...(description ? {} : { "aria-describedby": undefined })}
                >
                    <header className="flex items-start gap-4 px-6 pt-5 pb-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <DialogPrimitive.Title className="text-title font-semibold">{title}</DialogPrimitive.Title>
                            {description && (
                                <DialogPrimitive.Description className="text-body text-text-muted">
                                    {description}
                                </DialogPrimitive.Description>
                            )}
                        </div>
                        <DialogPrimitive.Close asChild>
                            <IconButton label="Close" icon={<X />} size="sm" className="-mr-2" />
                        </DialogPrimitive.Close>
                    </header>
                    {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">{children}</div>}
                    {footer && <footer className="flex justify-end gap-2 px-6 pt-3 pb-5">{footer}</footer>}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
