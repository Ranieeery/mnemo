import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HomeData } from "../shared/ipc/bindings";
import { folderContentsFixture, libraryFolderFixture } from "../shared/test/fixtures";
import { mockCommands } from "../shared/test/ipc";
import { createAppRouter } from "./router";

const seriesFolder = libraryFolderFixture({ path: "D:\\Series", name: "Series" });
const emptyHome: HomeData = { continueWatching: [], recentlyWatched: [], suggestions: [], folderPreviews: [] };

/** Test helper: the whole app at `path` (with its real router and root layout) over a small mocked backend. */
export function renderApp(path = "/", extraCommands: Record<string, unknown> = {}) {
    const calls = mockCommands({
        list_library_folders: [seriesFolder],
        get_home: emptyHome,
        media_tools_status: { ffmpeg: true, ffprobe: true },
        process_folders: null,
        get_processing_status: { jobs: [], inFlight: [], cancelling: false, errors: [] },
        get_library_folder_statuses: [],
        browse_folder: folderContentsFixture({ path: seriesFolder.path }),
        get_folder_summary: { totalVideos: 0, watchedVideos: 0, taggedVideos: 0 },
        ...extraCommands,
    });
    const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    render(<RouterProvider router={router} />);
    return { user: userEvent.setup(), router, calls };
}
