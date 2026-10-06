import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commands, type KeyboardShortcuts } from "../../shared/ipc/bindings";
import { call, errorMessage } from "../../shared/ipc/client";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { toast } from "../../shared/ui";

/**
 * Saves the shortcuts. The new keys apply at once everywhere (the shared query is updated before the backend answers)
 * and go back to the saved ones if it refuses them.
 */
export function useSaveShortcuts() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ shortcuts }: { shortcuts: KeyboardShortcuts; message: string }) =>
            call(commands.updateKeyboardShortcuts(shortcuts)),
        onMutate: async ({ shortcuts }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.keyboardShortcuts() });
            const previous = queryClient.getQueryData<KeyboardShortcuts>(queryKeys.keyboardShortcuts());
            queryClient.setQueryData(queryKeys.keyboardShortcuts(), shortcuts);
            return { previous };
        },
        onSuccess: (saved, { message }) => {
            queryClient.setQueryData(queryKeys.keyboardShortcuts(), saved);
            toast({ title: message, tone: "success" });
        },
        onError: (error, _variables, context) => {
            queryClient.setQueryData(queryKeys.keyboardShortcuts(), context?.previous);
            toast({ title: "Could not save the shortcut", description: errorMessage(error), tone: "danger" });
        },
    });
}
