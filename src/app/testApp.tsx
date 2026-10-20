import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SIDEBAR_PREFERENCES, type HomeData } from "../shared/ipc/bindings";
import { folderContentsFixture, libraryCommandsFixture, libraryFolderFixture } from "../shared/test/fixtures";
import { mockCommands } from "../shared/test/ipc";
import { createAppRouter } from "./router";

const seriesFolder = libraryFolderFixture({ path: "D:\\Series", name: "Series" });
const emptyHome: HomeData = { continueWatching: [], recentlyWatched: [], suggestions: [], folderPreviews: [] };

/** Test helper: the whole app at `path` (with its real router and root layout) over a small mocked backend. */
export function renderApp(path = "/", extraCommands: Record<string, unknown> = {}) {
    const calls = mockCommands({
        ...libraryCommandsFixture([seriesFolder]),
        get_library_folder_sort: "custom",
        get_home: emptyHome,
        media_tools_status: { ffmpeg: true, ffprobe: true },
        process_folders: null,
        get_processing_status: { jobs: [], inFlight: [], cancelling: false, errors: [] },
        get_library_folder_statuses: [],
        list_hidden_folders: [],
        browse_folder: folderContentsFixture({ path: seriesFolder.path }),
        get_folder_summary: { totalVideos: 0, watchedVideos: 0, taggedVideos: 0 },
        get_sidebar_preferences: DEFAULT_SIDEBAR_PREFERENCES,
        update_sidebar_preferences: ({ preferences }: { preferences: unknown }) => preferences,
        ...extraCommands,
    });
    const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
    render(<RouterProvider router={router} />);
    return { user: userEvent.setup(), router, calls };
}
