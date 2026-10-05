import { SearchX } from "lucide-react";
import type { VideoEntry } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { baseName, relativeSegments } from "../../../shared/lib/paths";
import { EmptyState, ErrorState, Progress } from "../../../shared/ui";
import { toEntry, VideoGrid, VideoGridSkeleton } from "../../../shared/video";
import { LIBRARY_SEARCH_LIMIT, useFolderSearch, useLibrarySearch } from "../queries";

function ResultCount({ count, query, capped = false }: { count: number; query: string; capped?: boolean }) {
    return (
        <p className="text-body text-text-muted" role="status">
            {capped ? `First ${count}` : count} {count === 1 ? "video matches" : "videos match"}{" "}
            <span className="text-text">"{query}"</span>
        </p>
    );
}

function NoMatches({ query, hint }: { query: string; hint: string }) {
    return <EmptyState icon={SearchX} title={`No videos match "${query}"`} description={hint} />;
}

function parentFolder(path: string): string {
    return baseName(path.replace(/[\\/][^\\/]+$/, ""));
}

/** Results of a library-wide search by title, description and tags. */
export function LibrarySearchResults({ query }: { query: string }) {
    const search = useLibrarySearch(query);

    if (search.isPending) {
        return <VideoGridSkeleton />;
    }
    if (search.isError) {
        return (
            <ErrorState title="Search failed" message={errorMessage(search.error)} onRetry={() => search.refetch()} />
        );
    }
    if (search.data.length === 0) {
        return <NoMatches query={query} hint="Search looks at titles, descriptions and tags of videos already read." />;
    }
    return (
        <div className="flex flex-col gap-4">
            <ResultCount count={search.data.length} query={query} capped={search.data.length >= LIBRARY_SEARCH_LIMIT} />
            <VideoGrid entries={search.data.map(toEntry)} detail={(entry) => parentFolder(entry.path)} />
        </div>
    );
}

/** Results of a file name search on disk below `path`, including videos that were not read yet. */
export function FolderSearchResults({ path, query }: { path: string; query: string }) {
    const { search, progress } = useFolderSearch(path, query);
    const detail = (entry: VideoEntry) => relativeSegments(entry.path, path)?.slice(0, -1).join(" / ") || undefined;

    if (search.isPending) {
        return (
            <div className="flex max-w-xl flex-col gap-2" role="status">
                <Progress label="Searching files" value={null} size="thin" />
                <p className="truncate text-small text-text-muted">
                    {progress
                        ? `Looked at ${progress.scannedFiles} files, now in ${baseName(progress.currentFolder)}`
                        : "Searching files on disk"}
                </p>
            </div>
        );
    }
    if (search.isError) {
        return (
            <ErrorState title="Search failed" message={errorMessage(search.error)} onRetry={() => search.refetch()} />
        );
    }
    if (search.data.length === 0) {
        return <NoMatches query={query} hint="Search matches file names in this folder and all of its subfolders." />;
    }
    return (
        <div className="flex flex-col gap-4">
            <ResultCount count={search.data.length} query={query} />
            <VideoGrid entries={search.data} detail={detail} />
        </div>
    );
}
