import { useNavigate } from "@tanstack/react-router";
import { VideoDetailsDialog } from "../features/library";
import { ShortcutsHelpDialog } from "../features/shortcuts";
import { VideoTagsEditor } from "../features/tags";
import { closeShortcutsHelp, closeVideoDetails, useDialogStore } from "../shared/stores/dialogs";

/** App-wide dialogs, composed from the features that own their parts. */
export function DialogHost() {
    const video = useDialogStore((state) => state.videoDetails);
    const shortcutsHelp = useDialogStore((state) => state.shortcutsHelp);
    const navigate = useNavigate();

    return (
        <>
            {video && (
                <VideoDetailsDialog
                    key={video.id}
                    video={video}
                    onClose={closeVideoDetails}
                    tagsEditor={<VideoTagsEditor videoId={video.id} />}
                />
            )}
            {shortcutsHelp && (
                <ShortcutsHelpDialog
                    onClose={closeShortcutsHelp}
                    onCustomize={() => {
                        closeShortcutsHelp();
                        void navigate({ to: "/settings", search: { tab: "shortcuts" } });
                    }}
                />
            )}
        </>
    );
}
