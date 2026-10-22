import { commands, events } from "../../../shared/ipc/bindings";
import { call, errorMessage } from "../../../shared/ipc/client";
import { queryClient } from "../../../shared/ipc/queryClient";
import { queryKeys } from "../../../shared/ipc/queryKeys";
import { toast } from "../../../shared/ui";

/** Opens the newer release's page in the browser. The backend knows which release and builds the address. */
export function openReleasePage() {
    call(commands.openReleasePage()).catch((error: unknown) =>
        toast({ title: "Could not open the release page", description: errorMessage(error), tone: "danger" })
    );
}

/**
 * Shows the backend's notice of a newer version. The automatic check sends it once per version, so the toast is not
 * repeated after a restart. Call once at the app root; returns the cleanup.
 */
export function followUpdates(): () => void {
    let active = true;
    const subscription = events.updateAvailable.listen(({ payload }) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.updateStatus() });
        toast({
            title: `Mnemo ${payload} is available`,
            description: "Its page on GitHub has what's new and the installers.",
            action: { label: "View release", onClick: openReleasePage },
        });
    });
    return () => {
        // Stopping twice must not unsubscribe twice.
        if (!active) {
            return;
        }
        active = false;
        void subscription.then((unlisten) => unlisten());
    };
}
