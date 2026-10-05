import type { Channel } from "@tauri-apps/api/core";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SearchProgress, VideoEntry } from "../../shared/ipc/bindings";
import { videoFixture } from "../../shared/test/fixtures";
import { mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { FolderSearchResults, LibrarySearchResults } from "./components/SearchResults";

describe("LibrarySearchResults", () => {
    it("lists the matching videos with the folder they are in", async () => {
        mockCommands({
            search_library: [
                videoFixture({ id: 1, title: "Finale", filePath: "D:\\Videos\\Show\\Season 2\\Finale.mkv" }),
            ],
        });
        renderScreen(<LibrarySearchResults query="fin" />);

        expect(await screen.findByText(/1 video matches/)).toHaveTextContent('1 video matches "fin"');
        const card = screen.getByRole("button", { name: "Finale" });
        expect(card).toHaveTextContent("Season 2");
    });

    it("explains what search looks at when nothing matches", async () => {
        mockCommands({ search_library: [] });
        renderScreen(<LibrarySearchResults query="zzz" />);
        expect(await screen.findByRole("heading", { name: 'No videos match "zzz"' })).toBeInTheDocument();
        expect(screen.getByText(/titles, descriptions and tags/)).toBeInTheDocument();
    });
});

describe("FolderSearchResults", () => {
    it("reports scan progress, then lists processed and unprocessed matches", async () => {
        let finish: (entries: VideoEntry[]) => void = () => {};
        mockCommands({
            search_folder: ({ onProgress }: Record<string, unknown>) => {
                (onProgress as Channel<SearchProgress>).onmessage({
                    scannedFiles: 120,
                    currentFolder: "D:\\Videos\\Show\\Season 2",
                });
                return new Promise<VideoEntry[]>((resolve) => {
                    finish = resolve;
                });
            },
        });
        renderScreen(<FolderSearchResults path={"D:\\Videos\\Show"} query="ep" />);

        expect(await screen.findByText("Looked at 120 files, now in Season 2")).toBeInTheDocument();

        finish([
            {
                path: "D:\\Videos\\Show\\Ep 1.mkv",
                name: "Ep 1.mkv",
                video: videoFixture({ id: 1, title: "Episode one" }),
            },
            { path: "D:\\Videos\\Show\\Season 2\\Ep 2.mkv", name: "Ep 2.mkv", video: null },
        ]);
        expect(await screen.findByRole("button", { name: "Episode one" })).toBeInTheDocument();
        const unprocessed = screen.getByRole("button", { name: "Ep 2" });
        expect(unprocessed).toHaveTextContent("Season 2");
        expect(unprocessed).toHaveTextContent("Not processed");
    });
});
