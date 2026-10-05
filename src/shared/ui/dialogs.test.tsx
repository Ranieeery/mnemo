import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog } from "./Dialog";

function ConfirmHarness({ onConfirm }: { onConfirm: () => Promise<void> | void }) {
    const [open, setOpen] = useState(true);
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Remove Series from the library?"
            description="Files on disk are not touched."
            confirmLabel="Remove folder"
            tone="danger"
            onConfirm={onConfirm}
        />
    );
}

describe("ConfirmDialog", () => {
    it("runs the action and closes on success", async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        const { user } = renderWithUi(<ConfirmHarness onConfirm={onConfirm} />);
        expect(screen.getByRole("alertdialog", { name: "Remove Series from the library?" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Remove folder" }));
        expect(onConfirm).toHaveBeenCalledOnce();
        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    });

    it("stays open when the action fails", async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error("disk busy"));
        const { user } = renderWithUi(<ConfirmHarness onConfirm={onConfirm} />);
        await user.click(screen.getByRole("button", { name: "Remove folder" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Remove folder" })).toBeEnabled());
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    it("cancels without running the action", async () => {
        const onConfirm = vi.fn();
        const { user } = renderWithUi(<ConfirmHarness onConfirm={onConfirm} />);
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onConfirm).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    });
});

describe("Dialog", () => {
    it("is labelled by its title and closes with the close button or Escape", async () => {
        const onOpenChange = vi.fn();
        const { user } = renderWithUi(
            <Dialog open onOpenChange={onOpenChange} title="Video details" description="Edit title and tags.">
                <p>Body</p>
            </Dialog>
        );
        const dialog = screen.getByRole("dialog", { name: "Video details" });
        expect(dialog).toHaveAccessibleDescription("Edit title and tags.");

        await user.click(screen.getByRole("button", { name: "Close" }));
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
        await user.keyboard("{Escape}");
        expect(onOpenChange).toHaveBeenCalledTimes(2);
    });
});
