import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RelocationCheck } from "../../shared/ipc/bindings";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { RelocateFolderDialog } from "./components/RelocateFolderDialog";

const FROM = "D:\\Series";

function checkResult(overrides: Partial<RelocationCheck> = {}): RelocationCheck {
    return {
        from: FROM,
        to: "E:\\Series",
        totalVideos: 150,
        foundVideos: 150,
        differentVideos: 0,
        quality: "complete",
        ...overrides,
    };
}

/** The folder picker answers each call with the next of `picks` (`null` is a cancelled picker). */
function mockRelocation(picks: (string | null)[], commands: Record<string, unknown> = {}) {
    return mockCommands({
        "plugin:dialog|open": () => picks.shift() ?? null,
        check_folder_relocation: ({ to }: { to: string }) => checkResult({ to }),
        relocate_library_folder: ({ to }: { to: string }) => ({
            folder: libraryFolderFixture({ path: to, name: "Series" }),
            totalVideos: 150,
            foundVideos: 150,
        }),
        ...commands,
    });
}

describe("RelocateFolderDialog", () => {
    it("does nothing when the folder picker is cancelled", async () => {
        const calls = mockRelocation([null]);
        const onClose = vi.fn();
        renderScreen(<RelocateFolderDialog from={FROM} onClose={onClose} />);

        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(callsOf(calls, "check_folder_relocation")).toEqual([]);
    });

    it("shows what was found, then applies the new location", async () => {
        const calls = mockRelocation(["E:\\Series"]);
        const onClose = vi.fn();
        const { user } = renderScreen(<RelocateFolderDialog from={FROM} onClose={onClose} />);

        const dialog = await screen.findByRole("dialog", { name: "Locate Series" });
        expect(await within(dialog).findByText("150 of 150 videos found")).toBeInTheDocument();
        expect(dialog).toHaveTextContent("E:\\Series");
        expect(within(dialog).queryByRole("button", { name: "Choose another folder…" })).not.toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "Use this folder" }));

        expect(await screen.findByText("Located Series")).toBeInTheDocument();
        expect(screen.getByText("150 of 150 videos found.")).toBeInTheDocument();
        expect(callsOf(calls, "relocate_library_folder")).toEqual([{ from: FROM, to: "E:\\Series" }]);
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    });

    it("warns when few videos match, and can look at another folder", async () => {
        const calls = mockRelocation(["E:\\Other", "E:\\Series"], {
            check_folder_relocation: ({ to }: { to: string }) =>
                to === "E:\\Other"
                    ? checkResult({ to, foundVideos: 3, differentVideos: 2, quality: "poor" })
                    : checkResult({ to, foundVideos: 142, quality: "partial" }),
        });
        const { user } = renderScreen(<RelocateFolderDialog from={FROM} onClose={() => {}} />);

        const dialog = await screen.findByRole("dialog", { name: "Locate Series" });
        const warning = await within(dialog).findByRole("alert");
        expect(warning).toHaveTextContent("Only 3 of 150 videos found");
        expect(warning).toHaveTextContent("This may not be the same folder");
        expect(warning).toHaveTextContent("2 files with the same name have a different size.");
        expect(within(dialog).getByRole("button", { name: "Use anyway" })).toBeEnabled();

        await user.click(within(dialog).getByRole("button", { name: "Choose another folder…" }));
        expect(await within(dialog).findByText("142 of 150 videos found")).toBeInTheDocument();
        expect(within(dialog).getByText(/listed as missing until they show up/)).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Use this folder" })).toBeInTheDocument();
        expect(callsOf(calls, "check_folder_relocation")).toEqual([
            { from: FROM, to: "E:\\Other" },
            { from: FROM, to: "E:\\Series" },
        ]);
    });

    it("explains why a folder can't be used and offers another pick", async () => {
        mockRelocation(["D:\\Movies"], {
            check_folder_relocation: () => {
                throw commandError("invalidInput", "D:\\Movies is already a library folder.");
            },
        });
        renderScreen(<RelocateFolderDialog from={FROM} onClose={() => {}} />);

        const dialog = await screen.findByRole("dialog", { name: "Locate Series" });
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("D:\\Movies is already a library folder.");
        expect(within(dialog).getByRole("button", { name: "Choose another folder…" })).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: /^Use/ })).not.toBeInTheDocument();
    });

    it("stays open with the error when applying fails", async () => {
        mockRelocation(["E:\\Series"], {
            relocate_library_folder: () => {
                throw commandError("invalidInput", "Series is connected again, so there is nothing to locate.");
            },
        });
        const onClose = vi.fn();
        const { user } = renderScreen(<RelocateFolderDialog from={FROM} onClose={onClose} />);

        const dialog = await screen.findByRole("dialog", { name: "Locate Series" });
        await user.click(await within(dialog).findByRole("button", { name: "Use this folder" }));
        expect(await within(dialog).findByText("Could not locate the folder")).toBeInTheDocument();
        expect(dialog).toHaveTextContent("Nothing was changed.");
        expect(onClose).not.toHaveBeenCalled();
    });
});
