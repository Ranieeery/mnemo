import { emit } from "@tauri-apps/api/event";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { callsOf, mockCommands } from "../../../shared/test/ipc";
import { renderWithUi } from "../../../shared/test/render";
import { followUpdates } from "./updates";

/** Listening is asynchronous; events sent before it is set up would be missed. */
const listening = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("followUpdates", () => {
    let stop: () => void = () => {};

    afterEach(() => stop());

    it("announces a newer version with a link to its release page", async () => {
        const calls = mockCommands({ open_release_page: null });
        const { user } = renderWithUi(<p>App</p>);
        stop = followUpdates();
        await listening();
        expect(screen.queryByText(/is available/)).not.toBeInTheDocument();

        await emit("update-available", "2.7.0");
        expect(await screen.findByText("Mnemo 2.7.0 is available")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "View release" }));
        expect(callsOf(calls, "open_release_page")).toEqual([{}]);
    });

    it("stops listening when cleaned up", async () => {
        mockCommands({});
        renderWithUi(<p>App</p>);
        stop = followUpdates();
        await listening();
        stop();
        stop();
        // Unsubscribing is asynchronous too.
        await listening();

        await emit("update-available", "2.7.0");
        await listening();
        expect(screen.queryByText("Mnemo 2.7.0 is available")).not.toBeInTheDocument();
    });
});
