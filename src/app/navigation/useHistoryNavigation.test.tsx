import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HiddenFolder } from "../../shared/ipc/bindings";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { isConcealed, useHistoryNavigation } from "./useHistoryNavigation";

const PRIVATE: HiddenFolder = {
    path: "D:\\Videos\\Private",
    name: "Private",
    libraryFolder: libraryFolderFixture(),
    available: true,
};
const HIDDEN_VIDEO = "D:\\Videos\\Private\\Season 1\\a.mkv";

describe("isConcealed", () => {
    it("keeps a hidden video from opening outside its hidden folder", () => {
        const watch = { route: "watch", path: HIDDEN_VIDEO } as const;
        expect(isConcealed(watch, null, [PRIVATE])).toBe(true);
        expect(isConcealed(watch, { route: "folder", path: "D:\\Videos" }, [PRIVATE])).toBe(true);
        expect(isConcealed(watch, { route: "folder", path: "D:\\Videos\\Private 2" }, [PRIVATE])).toBe(true);
        expect(isConcealed(watch, { route: "folder", path: "D:\\Videos\\Private" }, [PRIVATE])).toBe(false);
        expect(isConcealed(watch, { route: "watch", path: "D:\\Videos\\Private\\b.mkv" }, [PRIVATE])).toBe(false);
        expect(isConcealed(watch, null, [])).toBe(false);
        // Only videos: the folder screen itself is browsing.
        expect(isConcealed({ route: "folder", path: "D:\\Videos\\Private" }, null, [PRIVATE])).toBe(false);
    });
});

function Arrows() {
    const { canGoBack, canGoForward, back, forward } = useHistoryNavigation();
    return (
        <>
            <button type="button" disabled={!canGoBack} onClick={back}>
                Back
            </button>
            <button type="button" disabled={!canGoForward} onClick={forward}>
                Forward
            </button>
        </>
    );
}

function setup(hidden: HiddenFolder[]) {
    mockCommands({ list_hidden_folders: hidden });
    const screenResult = renderScreen(<Arrows />);
    const { router } = screenResult;
    const visit = (to: "/" | "/folder" | "/watch", path?: string) =>
        act(() => router.history.push(`${to}${path ? router.options.stringifySearch({ path }) : ""}`));
    const back = () => act(() => router.history.back());
    return { ...screenResult, visit, back };
}

describe("useHistoryNavigation", () => {
    it("does not reopen a hidden video from outside its folder", async () => {
        const { user, visit, back, router } = setup([PRIVATE]);
        await screen.findByRole("button", { name: "Back" });
        await visit("/folder", PRIVATE.path);
        await visit("/watch", HIDDEN_VIDEO);
        await back();
        // Inside the hidden folder, forward reopens the video.
        await waitFor(() => expect(screen.getByRole("button", { name: "Forward" })).toBeEnabled());

        // From the home page, forward leads to the hidden folder (browsing it is allowed), not to its video.
        await back();
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        await user.click(screen.getByRole("button", { name: "Forward" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/folder"));
    });

    it("skips a hidden video's entry and disables a direction with nothing else", async () => {
        const { user, visit, back, router } = setup([PRIVATE]);
        await screen.findByRole("button", { name: "Back" });
        await visit("/watch", HIDDEN_VIDEO);
        await back();
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        await waitFor(() => expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled());

        await visit("/watch", HIDDEN_VIDEO);
        await visit("/folder", "D:\\Videos\\Other");
        await user.click(screen.getByRole("button", { name: "Back" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        await waitFor(() => expect(screen.getByRole("button", { name: "Forward" })).toBeEnabled());
        await user.click(screen.getByRole("button", { name: "Forward" }));
        await waitFor(() => expect(router.state.location.pathname).toBe("/folder"));
    });

    it("goes back and forward as usual when nothing is hidden", async () => {
        const { visit, back } = setup([]);
        await screen.findByRole("button", { name: "Back" });
        await visit("/watch", HIDDEN_VIDEO);
        await back();
        await waitFor(() => expect(screen.getByRole("button", { name: "Forward" })).toBeEnabled());
    });
});
