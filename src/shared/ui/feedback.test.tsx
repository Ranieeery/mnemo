import { act, screen } from "@testing-library/react";
import { FolderOpen } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { Tag } from "./Badge";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Progress } from "./Progress";
import { toast } from "./Toast";

describe("toast", () => {
    it("shows a message with its action and can be dismissed", async () => {
        const onUndo = vi.fn();
        const { user } = renderWithUi(<div />);
        act(() => {
            toast({
                title: "Marked 12 videos as watched",
                tone: "success",
                action: { label: "Undo", onClick: onUndo },
            });
        });

        expect(await screen.findByText("Marked 12 videos as watched")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Undo" }));
        expect(onUndo).toHaveBeenCalledOnce();

        act(() => {
            toast({ title: "Library exported" });
        });
        const latestDismiss = (await screen.findAllByRole("button", { name: "Dismiss" })).at(-1);
        if (!latestDismiss) {
            throw new Error("expected a dismiss button");
        }
        await user.click(latestDismiss);
        expect(screen.queryByText("Library exported")).not.toBeInTheDocument();
    });
});

describe("Tag", () => {
    it("offers a labelled remove button only when removable", async () => {
        const onRemove = vi.fn();
        const { user, rerender } = renderWithUi(<Tag onRemove={onRemove}>anime</Tag>);
        await user.click(screen.getByRole("button", { name: "Remove tag anime" }));
        expect(onRemove).toHaveBeenCalledOnce();

        rerender(<Tag>anime</Tag>);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});

describe("EmptyState and ErrorState", () => {
    it("explain the situation and offer the next step", async () => {
        const onRetry = vi.fn();
        const { user } = renderWithUi(
            <>
                <EmptyState icon={FolderOpen} title="No videos in this folder" description="Open a subfolder." />
                <ErrorState title="ffmpeg is not installed" onRetry={onRetry} retryLabel="Check again" />
            </>
        );
        expect(screen.getByRole("heading", { name: "No videos in this folder" })).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("ffmpeg is not installed");
        await user.click(screen.getByRole("button", { name: "Check again" }));
        expect(onRetry).toHaveBeenCalledOnce();
    });
});

describe("Progress", () => {
    it("exposes its value, or no value while indeterminate", () => {
        renderWithUi(
            <>
                <Progress label="Processing videos" value={30} max={60} />
                <Progress label="Scanning folder" value={null} />
            </>
        );
        expect(screen.getByRole("progressbar", { name: "Processing videos" })).toHaveAttribute("aria-valuenow", "30");
        expect(screen.getByRole("progressbar", { name: "Scanning folder" })).not.toHaveAttribute("aria-valuenow");
    });
});
