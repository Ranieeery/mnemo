import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { Toast as Primitive } from "radix-ui";
import type { ReactNode } from "react";
import { create } from "zustand";
import { cx } from "../lib/cx";

export type ToastTone = "info" | "success" | "danger";

export type ToastOptions = {
    title: string;
    description?: string;
    tone?: ToastTone;
    /** One follow-up action, e.g. "Undo" or "Retry". */
    action?: { label: string; onClick: () => void };
};

type QueuedToast = ToastOptions & { id: number };

type ToastStore = {
    toasts: QueuedToast[];
    push: (options: ToastOptions) => number;
    dismiss: (id: number) => void;
};

let nextId = 0;

const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    push: (options) => {
        nextId += 1;
        const id = nextId;
        set((state) => ({ toasts: [...state.toasts, { ...options, id }] }));
        return id;
    },
    dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Removes every toast. The queue outlives a screen, so tests start each case from an empty one. */
export function resetToasts() {
    useToastStore.setState({ toasts: [] });
}

/** Shows feedback for an action. Usable outside React (e.g. in mutation callbacks). */
export function toast(options: ToastOptions): number {
    return useToastStore.getState().push(options);
}

const toneIcon = {
    info: <Info className="text-text-muted" />,
    success: <CircleCheck className="text-success" />,
    danger: <CircleAlert className="text-danger" />,
} satisfies Record<ToastTone, ReactNode>;

/** Errors stay longer: they usually come with something to read or act on. */
const durationByTone: Record<ToastTone, number> = { info: 4000, success: 4000, danger: 8000 };

/** Renders queued toasts. Mount once near the root of the app. */
export function Toaster() {
    const toasts = useToastStore((state) => state.toasts);
    const dismiss = useToastStore((state) => state.dismiss);

    return (
        <Primitive.Provider swipeDirection="right">
            {toasts.map(({ id, title, description, tone = "info", action }) => (
                <Primitive.Root
                    key={id}
                    duration={durationByTone[tone]}
                    onOpenChange={(open) => !open && dismiss(id)}
                    className={cx(
                        "flex w-full items-start gap-3 rounded-card bg-surface-raised p-4 shadow-overlay",
                        "data-[state=open]:animate-slide-in data-[state=closed]:animate-disappear",
                        "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:animate-disappear",
                        "[&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0"
                    )}
                >
                    {toneIcon[tone]}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Primitive.Title className="text-body font-medium text-text">{title}</Primitive.Title>
                        {description && (
                            <Primitive.Description className="text-small break-words text-text-muted">
                                {description}
                            </Primitive.Description>
                        )}
                        {action && (
                            <Primitive.Action altText={action.label} asChild>
                                <button
                                    type="button"
                                    onClick={action.onClick}
                                    className="mt-1 self-start text-small font-medium text-text underline-offset-4 hover:underline"
                                >
                                    {action.label}
                                </button>
                            </Primitive.Action>
                        )}
                    </div>
                    <Primitive.Close
                        aria-label="Dismiss"
                        className="flex size-6 items-center justify-center rounded-badge text-text-subtle hover:bg-surface-hover hover:text-text"
                    >
                        <X className="size-4" aria-hidden />
                    </Primitive.Close>
                </Primitive.Root>
            ))}
            <Primitive.Viewport className="fixed right-0 bottom-0 z-50 m-0 flex w-96 max-w-[100vw] list-none flex-col gap-2 p-4 outline-none" />
        </Primitive.Provider>
    );
}
