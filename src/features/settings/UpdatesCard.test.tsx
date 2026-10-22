import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UpdateCheck, UpdateStatus } from "../../shared/ipc/bindings";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { UpdatesCard } from "./components/UpdatesCard";

function statusFixture(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
    return { automatic: true, lastCheckedMs: null, running: "2.6.0", available: null, ...overrides };
}

const upToDate: UpdateCheck = { status: "upToDate", running: "2.6.0" };
const available: UpdateCheck = { status: "available", running: "2.6.0", latest: "2.7.0" };

/** The text the live region holds, announced politely by screen readers. */
function liveRegion() {
    return screen.getByRole("status");
}

describe("UpdatesCard", () => {
    it("says it is checking, then that the app is up to date", async () => {
        let answer: (check: UpdateCheck) => void = () => {};
        const calls = mockCommands({
            get_update_status: statusFixture(),
            check_for_updates: () => new Promise<UpdateCheck>((resolve) => (answer = resolve)),
        });
        const { user } = renderScreen(<UpdatesCard />);
        expect(await screen.findByText("Not checked yet")).toBeInTheDocument();
        expect(liveRegion()).toHaveTextContent("");

        await user.click(screen.getByRole("button", { name: "Check now" }));
        expect(liveRegion()).toHaveTextContent("Checking for updates…");
        expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();

        answer(upToDate);
        await waitFor(() => expect(liveRegion()).toHaveTextContent("You're up to date (2.6.0)"));
        expect(screen.queryByRole("button", { name: "View release" })).not.toBeInTheDocument();
        // The status is read again to show when the check happened.
        expect(callsOf(calls, "get_update_status").length).toBeGreaterThan(1);
    });

    it("offers the release page of a newer version", async () => {
        const calls = mockCommands({
            get_update_status: statusFixture(),
            check_for_updates: available,
            open_release_page: null,
        });
        const { user } = renderScreen(<UpdatesCard />);
        await user.click(await screen.findByRole("button", { name: "Check now" }));
        await waitFor(() => expect(liveRegion()).toHaveTextContent("Version 2.7.0 is available"));

        await user.click(screen.getByRole("button", { name: "View release" }));
        // No address is sent: the backend builds it.
        expect(callsOf(calls, "open_release_page")).toEqual([{}]);
    });

    it("shows a failed check with a way to retry", async () => {
        let attempts = 0;
        const calls = mockCommands({
            get_update_status: statusFixture(),
            check_for_updates: () => {
                attempts += 1;
                if (attempts === 1) {
                    throw commandError("network", "could not reach GitHub: HTTP status 503");
                }
                return upToDate;
            },
        });
        const { user } = renderScreen(<UpdatesCard />);
        await user.click(await screen.findByRole("button", { name: "Check now" }));
        await waitFor(() =>
            expect(liveRegion()).toHaveTextContent(
                "Could not check for updates: could not reach GitHub: HTTP status 503"
            )
        );

        await user.click(screen.getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(liveRegion()).toHaveTextContent("You're up to date (2.6.0)"));
        expect(callsOf(calls, "check_for_updates")).toHaveLength(2);
        expect(screen.getByRole("button", { name: "Check now" })).toBeInTheDocument();
    });

    it("remembers a newer version found earlier and when the last check was", async () => {
        const calls = mockCommands({
            get_update_status: statusFixture({ lastCheckedMs: Date.UTC(2026, 9, 20, 12), available: "2.7.0" }),
            open_release_page: null,
        });
        const { user } = renderScreen(<UpdatesCard />);
        expect(await screen.findByText(/^Last checked: .*2026/)).toBeInTheDocument();
        expect(liveRegion()).toHaveTextContent("Version 2.7.0 is available");
        await user.click(screen.getByRole("button", { name: "View release" }));
        expect(callsOf(calls, "open_release_page")).toHaveLength(1);
        expect(callsOf(calls, "check_for_updates")).toEqual([]);
    });

    it("turns the automatic check off and on", async () => {
        const calls = mockCommands({
            get_update_status: statusFixture(),
            set_automatic_update_checks: (args: { enabled?: unknown }) =>
                statusFixture({ automatic: args.enabled === true }),
        });
        const { user } = renderScreen(<UpdatesCard />);
        const toggle = await screen.findByRole("switch", { name: "Check for updates automatically" });
        expect(toggle).toBeChecked();

        await user.click(toggle);
        await waitFor(() => expect(toggle).not.toBeChecked());
        expect(callsOf(calls, "set_automatic_update_checks")).toEqual([{ enabled: false }]);
        // Showing the card never checks by itself.
        expect(callsOf(calls, "check_for_updates")).toEqual([]);
    });

    it("works from the keyboard", async () => {
        const calls = mockCommands({
            get_update_status: statusFixture(),
            set_automatic_update_checks: (args: { enabled?: unknown }) =>
                statusFixture({ automatic: args.enabled === true }),
            check_for_updates: available,
        });
        const { user } = renderScreen(<UpdatesCard />);
        const toggle = await screen.findByRole("switch", { name: "Check for updates automatically" });

        await user.tab();
        expect(toggle).toHaveFocus();
        await user.keyboard(" ");
        await waitFor(() => expect(toggle).not.toBeChecked());

        await user.tab();
        expect(screen.getByRole("button", { name: "Check now" })).toHaveFocus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(liveRegion()).toHaveTextContent("Version 2.7.0 is available"));
        expect(callsOf(calls, "set_automatic_update_checks")).toEqual([{ enabled: false }]);
        expect(callsOf(calls, "check_for_updates")).toHaveLength(1);
    });
});
