import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { useCreateLibraryGroup } from "../groupQueries";

type NewGroupState = {
    /** A group being named, not created yet; with a folder, it moves into the group once created. */
    pending: { folder: LibraryFolder | null } | null;
    start: (folder: LibraryFolder | null) => void;
    /** Creates the pending group, or gives it up with `null` (or an empty name). */
    submit: (name: string | null, focusAfter: boolean) => void;
    /** The group just created from the keyboard, whose header takes the focus once listed. */
    focusGroupId: number | null;
    clearFocusGroup: () => void;
};

const NewGroupContext = createContext<NewGroupState | null>(null);

/** Lets the sort menu and the folders' menus start naming a new group, shown at the end of the folder list. */
export function NewGroupProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<NewGroupState["pending"]>(null);
    const [focusGroupId, setFocusGroupId] = useState<number | null>(null);
    // Here rather than in the field, which is gone before the group is created.
    const create = useCreateLibraryGroup();
    const value = useMemo<NewGroupState>(
        () => ({
            pending,
            start: (folder) => setPending({ folder }),
            submit: (name, focusAfter) => {
                setPending(null);
                if (pending && name !== null && name.trim() !== "") {
                    create.mutate(
                        { name, folder: pending.folder },
                        { onSuccess: (group) => focusAfter && setFocusGroupId(group.id) }
                    );
                }
            },
            focusGroupId,
            clearFocusGroup: () => setFocusGroupId(null),
        }),
        [pending, focusGroupId, create.mutate]
    );
    return <NewGroupContext value={value}>{children}</NewGroupContext>;
}

export function useNewGroup(): NewGroupState {
    const state = useContext(NewGroupContext);
    if (!state) {
        throw new Error("useNewGroup needs a surrounding NewGroupProvider");
    }
    return state;
}
