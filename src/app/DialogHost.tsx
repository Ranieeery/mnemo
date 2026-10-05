import { VideoDetailsDialog } from "../features/library";
import { VideoTagsEditor } from "../features/tags";
import { closeVideoDetails, useDialogStore } from "../shared/stores/dialogs";

/** App-wide dialogs, composed from the features that own their parts. */
export function DialogHost() {
    const video = useDialogStore((state) => state.videoDetails);
    if (!video) {
        return null;
    }
    return (
        <VideoDetailsDialog
            key={video.id}
            video={video}
            onClose={closeVideoDetails}
            tagsEditor={<VideoTagsEditor videoId={video.id} />}
        />
    );
}
