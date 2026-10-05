import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithUi } from "../test/render";
import { SearchInput } from "./SearchInput";

function ControlledSearch({ initial = "", onEscapeBubbled }: { initial?: string; onEscapeBubbled?: () => void }) {
    const [value, setValue] = useState(initial);
    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: captures bubbling keys for the assertion only.
        <div onKeyDown={(event) => event.key === "Escape" && onEscapeBubbled?.()}>
            <SearchInput label="Search videos" value={value} onValueChange={setValue} />
        </div>
    );
}

describe("SearchInput", () => {
    it("reports what the user types", async () => {
        const { user } = renderWithUi(<ControlledSearch />);
        await user.type(screen.getByRole("searchbox", { name: "Search videos" }), "pilot");
        expect(screen.getByRole("searchbox")).toHaveValue("pilot");
    });

    it("clears with the clear button and keeps focus in the field", async () => {
        const { user } = renderWithUi(<ControlledSearch initial="pilot" />);
        await user.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.getByRole("searchbox")).toHaveValue("");
        expect(screen.getByRole("searchbox")).toHaveFocus();
        expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });

    it("clears on Escape without letting the key bubble", async () => {
        const onEscapeBubbled = vi.fn();
        const { user } = renderWithUi(<ControlledSearch initial="pilot" onEscapeBubbled={onEscapeBubbled} />);
        await user.click(screen.getByRole("searchbox"));
        await user.keyboard("{Escape}");
        expect(screen.getByRole("searchbox")).toHaveValue("");
        expect(onEscapeBubbled).not.toHaveBeenCalled();
    });

    it("lets Escape bubble when the field is already empty", async () => {
        const onEscapeBubbled = vi.fn();
        const { user } = renderWithUi(<ControlledSearch onEscapeBubbled={onEscapeBubbled} />);
        await user.click(screen.getByRole("searchbox"));
        await user.keyboard("{Escape}");
        expect(onEscapeBubbled).toHaveBeenCalledOnce();
    });
});
