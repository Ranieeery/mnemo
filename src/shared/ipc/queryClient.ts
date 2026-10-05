import { QueryClient } from "@tanstack/react-query";
import { CommandError } from "./client";

/** Retrying makes sense for transient failures (a busy database), not for errors that will repeat. */
const PERMANENT_ERRORS = new Set(["notFound", "invalidInput", "mediaToolMissing", "importFormat", "cancelled"]);

export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Data only changes through this app (or a manual sync), and mutations invalidate what they touch.
                staleTime: 60_000,
                refetchOnWindowFocus: false,
                retry: (failureCount, error) =>
                    !(error instanceof CommandError && PERMANENT_ERRORS.has(error.kind)) && failureCount < 1,
            },
        },
    });
}

/** The app-wide client. Imported directly by code that runs outside React, like the processing store. */
export const queryClient = createQueryClient();
