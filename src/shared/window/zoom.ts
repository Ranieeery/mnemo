import { commands, ZOOM_IN_KEYS, ZOOM_OUT_KEYS, ZOOM_RESET_KEYS, type ZoomStep } from "../ipc/bindings";
import { call, errorMessage } from "../ipc/client";
import { comboFromEvent } from "../lib/keyboard";
import { dismissToast, toast } from "../ui/Toast";

const STEP_BY_KEY: ReadonlyMap<string, ZoomStep> = new Map([
    ...ZOOM_IN_KEYS.map((key) => [key, "in"] as const),
    ...ZOOM_OUT_KEYS.map((key) => [key, "out"] as const),
    ...ZOOM_RESET_KEYS.map((key) => [key, "reset"] as const),
]);

/** The toast with the current level: each change replaces it instead of piling up. */
let levelToast: number | null = null;

/** Changes the zoom in the backend, which applies and keeps it, and shows the new level. */
export async function changeZoom(step: ZoomStep) {
    try {
        const { level } = await call(commands.changeZoom(step));
        if (levelToast !== null) {
            dismissToast(levelToast);
        }
        levelToast = toast({
            title: `Zoom ${Math.round(level * 100)}%`,
            action: level === 1 ? undefined : { label: "Reset", onClick: () => void changeZoom("reset") },
        });
    } catch (error) {
        toast({ title: "Could not change the zoom", description: errorMessage(error), tone: "danger" });
    }
}

/**
 * The zoom keys (`Ctrl +`, `Ctrl -`, `Ctrl 0`) and `Ctrl` with the mouse wheel, on every screen, also while typing,
 * as in a browser. Call once at the app root; returns the cleanup.
 */
export function followZoomKeys(): () => void {
    // A wheel sends many events per gesture: one change at a time.
    let wheeling = false;

    const handleKeyDown = (event: KeyboardEvent) => {
        const combo = comboFromEvent(event);
        const step = combo === null ? undefined : STEP_BY_KEY.get(combo);
        if (step) {
            event.preventDefault();
            void changeZoom(step);
        }
    };
    const handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey || event.deltaY === 0) {
            return;
        }
        event.preventDefault();
        if (!wheeling) {
            wheeling = true;
            void changeZoom(event.deltaY < 0 ? "in" : "out").finally(() => {
                wheeling = false;
            });
        }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("wheel", handleWheel);
    };
}
