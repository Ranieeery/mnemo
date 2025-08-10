import { useEffect, useState } from "react";
import { invoke } from '@tauri-apps/api/core';
import { saveLibraryFolder, updateWatchProgress } from "./database";
import { checkVideoToolsAvailable } from "./services/videoProcessor";
import { ProcessedVideo } from "./types/video";
import { VideoLibraryService } from "./services/VideoLibraryService";
import { Settings } from "./components/Settings";
import ProcessingProgressBar from "./components/Progress/ProcessingProgressBar";
import SearchProgressBar from "./components/Progress/SearchProgressBar";
import TopBar from "./components/Navigation/TopBar";
import Sidebar from "./components/Sidebar/Sidebar";
import ConfirmRemovalModal from "./components/Modals/ConfirmRemovalModal";
import NextVideoModal from "./components/Modals/NextVideoModal";
import VideoDetailsModal from "./components/Modals/VideoDetailsModal";
import ContextMenu from "./components/ContextMenu/ContextMenu";
import HomePage from "./components/HomePage/HomePage";
import SearchResults from "./components/SearchResults/SearchResults";
import YouTubeStyleVideoPlayer from "./components/VideoPlayer/YouTubeStyleVideoPlayer";
import DirectoryView from "./components/DirectoryView/DirectoryView";
import { useLibraryManagement } from "./hooks/useLibraryManagement";
import { useVideoProcessing } from "./hooks/useVideoProcessing";
import { useVideoSearch } from "./hooks/useVideoSearch";
import { useVideoWatchedStatus } from "./hooks/useVideoWatchedStatus";
import { useVideoPlayer } from "./hooks/useVideoPlayer";
import { useModals } from "./hooks/useModals";
import { useContextMenu } from "./hooks/useContextMenu";
import { useVideoLibrary } from "./contexts/VideoLibraryContext";
import { useNavigation as useNavigationContext } from "./contexts/NavigationContext";
import "./styles/player.css";

// Natural (numeric-aware) string comparator for folder/file names
const naturalSort = (a: string, b: string): number => {
    return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
    });
};

function App() {
    // Context hooks – single source of truth for shared state
    const { state: videoLibraryState, actions: videoLibraryActions } = useVideoLibrary();
    const { state: navigationState, actions: navigationActions, computed: navigationComputed } = useNavigationContext();
    
    // Local state only for technical capabilities (not domain data)
    const [videoToolsAvailable, setVideoToolsAvailable] = useState<{
        ffmpeg: boolean;
        ffprobe: boolean
    }>({ ffmpeg: false, ffprobe: false });

    // Library management hook wired to context actions
    const [libraryState, libraryActions] = useLibraryManagement({
        videoToolsAvailable,
        libraryFolders: videoLibraryState.libraryFolders,
        setLibraryFolders: (folders: string[]) => {
            // Atualizar através das actions do context
            for (const folder of folders) {
                if (!videoLibraryState.libraryFolders.includes(folder)) {
                    videoLibraryActions.addLibraryFolder(folder);
                }
            }
        },
        loadHomePageData: videoLibraryActions.loadHomePageData
    });

    // Video processing hook
    const [videoProcessingState, videoProcessingActions] = useVideoProcessing({
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact
    });

    // Video search hook
    const [searchState, searchActions] = useVideoSearch({
        selectedFolder: videoLibraryState.selectedFolder,
        onShowHomePage: () => {
            navigationActions.goToHome();
            videoLibraryActions.loadHomePageData();
        }
    });

    // Will be assigned after videoPlayer is created (cyclic dependency)
    let toggleVideoWatchedStatus: (video: ProcessedVideo) => Promise<void>;

    // App initialization
    useEffect(() => {
        const initializeApp = async () => {
            try {
                // Initialize library via context
                await videoLibraryActions.initializeLibrary();

                // Detect external video tools availability
                const tools = await checkVideoToolsAvailable();
                setVideoToolsAvailable(tools);

                if (!tools.ffmpeg || !tools.ffprobe) console.warn('Video tools not available. Video processing will be limited.');

                // One‑time migration from localStorage if legacy data exists
                const savedFoldersLegacy = localStorage.getItem('libraryFolders');
                if (savedFoldersLegacy) {
                    const legacyFolders = JSON.parse(savedFoldersLegacy);
                    for (const folder of legacyFolders) {
                        await saveLibraryFolder(folder);
                        videoLibraryActions.addLibraryFolder(folder);
                    }
                    localStorage.removeItem('libraryFolders');
                    // Reload after migration
                    await videoLibraryActions.loadLibraryFolders();
                    await videoLibraryActions.loadHomePageData();
                }
            } catch (error) {
                console.error('Failed to initialize application:', error);
                videoLibraryActions.setError('Failed to initialize application');
            }
        };

        initializeApp();
    }, []); // Executar apenas uma vez

    // Select a folder from sidebar
    const handleSelectFolder = (folder: string) => {
        navigationActions.navigateTo(folder);
        videoLibraryActions.selectFolder(folder);
        loadDirectoryContents(folder);
    };

    // Open remove-folder confirmation modal
    const handleRemoveFolderRequest = (folderPath: string) => {
        modals.handleRemoveFolderRequest(folderPath);
    };

    // Confirm folder removal
    const confirmRemoveFolder = async () => {
        await modals.confirmRemoveFolder();
    };

    // Cancel folder removal
    const cancelRemoveFolder = () => {
        modals.cancelRemoveFolder();
    };

    // Load directory contents (folders + processed videos)
    const loadDirectoryContents = async (path: string) => {
        try {
            // Use service layer to load processed videos
            videoLibraryActions.setLoading(true);
            
        // Load processed videos for directory
            const processedVideos = await VideoLibraryService.getVideosInDirectory(path);
            videoLibraryActions.setProcessedVideos(processedVideos);
            
        // Raw directory listing (subfolders + files) for navigation
            const directoryContents: any[] = await invoke('read_directory', { path });
            navigationActions.setDirectoryContents(directoryContents);
            
        // Background (re)processing if tools available
            if (videoToolsAvailable.ffmpeg && videoToolsAvailable.ffprobe) {
                videoProcessingActions.processVideosInBackground(path);
            }
        } catch (error) {
        console.error('Error loading directory contents:', error);
        videoLibraryActions.setError('Error loading directory contents');
        } finally {
            videoLibraryActions.setLoading(false);
        }
    };

    // Sync folder selection & contents when navigating via history (back/forward)
    useEffect(() => {
        if (!navigationState.showHomePage && navigationState.currentPath) {
            if (videoLibraryState.selectedFolder !== navigationState.currentPath) {
                videoLibraryActions.selectFolder(navigationState.currentPath);
                loadDirectoryContents(navigationState.currentPath);
            }
        }
    }, [navigationState.currentPath, navigationState.showHomePage]);

    // Video player hook
    const videoPlayer = useVideoPlayer({
        setShowVideoPlayer: (_show: boolean) => {
            // Controlar exibição do player via state local ou navigation
            // Por enquanto, vamos usar uma abordagem simplificada
        },
        updateWatchProgress,
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact,
        loadHomePageData: videoLibraryActions.loadHomePageData
    });

    // Initialize watched-status hook now that player exists
    ({ toggleVideoWatchedStatus } = useVideoWatchedStatus({
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact,
        setRecentVideos: videoLibraryActions.setRecentVideosReact,
        setVideosInProgress: videoLibraryActions.setVideosInProgressReact,
        setSuggestedVideos: videoLibraryActions.setSuggestedVideosReact,
        loadHomePageData: videoLibraryActions.loadHomePageData,
        selectedFolder: videoLibraryState.selectedFolder,
        searchState,
        searchActions,
        currentlyPlayingVideo: videoPlayer.playingVideo,
        setPlayingVideo: videoPlayer.setPlayingVideo
    }));

    // Navigate to a directory
    const navigateToDirectory = (path: string) => {
        navigationActions.navigateTo(path);
        loadDirectoryContents(path);
    };

    // Open video details modal
    const handleOpenVideoDetails = (video: ProcessedVideo) => {
        modals.handleOpenVideoDetails(video);
    };

    // Close video details modal
    const handleCloseVideoDetails = () => {
        modals.handleCloseVideoDetails();
    };

    // Persist video detail edits
    const handleSaveVideoDetails = async () => {
        await modals.handleSaveVideoDetails();
    };

    // Cancel video detail editing session
    const handleCancelEdit = () => {
        modals.handleCancelEdit();
    };





    // Mouse back/forward button support
    useEffect(() => {
        const handleMouseButtons = (event: MouseEvent) => {
            if (event.button === 3) { // Back button
                event.preventDefault();
                if (navigationComputed.canGoBack) {
                    navigationActions.goBack();
                }
            } else if (event.button === 4) { // Forward button
                event.preventDefault();
                if (navigationComputed.canGoForward) {
                    navigationActions.goForward();
                }
            }
        };

        document.addEventListener('mousedown', handleMouseButtons);
        return () => {
            document.removeEventListener('mousedown', handleMouseButtons);
        };
    }, [navigationComputed.canGoBack, navigationComputed.canGoForward]);

    // Keyboard shortcuts (navigation + player)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // ESC: close player
            if (event.key === 'Escape') {
                event.preventDefault();
                if (videoPlayer.playingVideo) {
                    videoPlayer.handleCloseVideoPlayer();
                }
                return;
            }

            // Alt+Left: back
            if (event.altKey && event.key === 'ArrowLeft') {
                event.preventDefault();
                if (navigationComputed.canGoBack) {
                    navigationActions.goBack();
                }
            }
            // Alt+Right: forward
            else if (event.altKey && event.key === 'ArrowRight') {
                event.preventDefault();
                if (navigationComputed.canGoForward) {
                    navigationActions.goForward();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [navigationComputed.canGoBack, navigationComputed.canGoForward, videoPlayer.playingVideo, videoPlayer.handleCloseVideoPlayer]);

    // Open settings
    const handleOpenSettings = () => {
        modals.handleOpenSettings();
    };

    // Close settings
    const handleCloseSettings = () => {
        modals.handleCloseSettings();
    };

    // Library import side-effects (refresh data)
    const handleLibraryChanged = async () => {
    // Reload library folders
        await videoLibraryActions.loadLibraryFolders();

    // Refresh home page data if visible
        if (navigationState.showHomePage) {
            await videoLibraryActions.loadHomePageData();
        }

    // If in a folder, clear and let context reload
        if (videoLibraryState.selectedFolder) {
            videoLibraryActions.setProcessedVideos([]);
            // Recarregar será feito automaticamente pelo context
        }

    // Reset search if active
        if (searchState.searchTerm) {
            searchActions.clearSearch();
        }
    };

    // Modals management hook
    const modals = useModals({
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact,
        libraryActions,
        navigation: { goToHomePage: navigationActions.goToHome },
        videoPlayer,
        selectedFolder: videoLibraryState.selectedFolder,
        handleLibraryChanged
    });

    // Context menu hook
    const contextMenuHook = useContextMenu({
        onOpenVideoDetails: handleOpenVideoDetails
    });

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Play next video (after countdown modal)
    const playNextVideo = async () => {
        await modals.playNextVideo();
    };

    // Cancel next video autoplay
    const cancelNextVideo = () => {
        modals.cancelNextVideo();
    };

    return (
        <div className="h-screen bg-gray-900 text-white flex">
            {/* Sidebar */}
            <Sidebar
                libraryFolders={videoLibraryState.libraryFolders}
                selectedFolder={videoLibraryState.selectedFolder}
                folderIndexingStatus={libraryState.folderIndexingStatus}
                onAddFolder={libraryActions.handleAddFolder}
                onSelectFolder={handleSelectFolder}
                onRemoveFolderRequest={handleRemoveFolderRequest}
                onGoToHomePage={navigationActions.goToHome}
                onOpenSettings={handleOpenSettings}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
                {/* Top Bar */}
                <TopBar
                    selectedFolder={videoLibraryState.selectedFolder}
                    canGoBack={navigationComputed.canGoBack}
                    canGoForward={navigationComputed.canGoForward}
                    onGoBack={navigationActions.goBack}
                    onGoForward={navigationActions.goForward}
                    searchTerm={searchState.searchTerm}
                    setSearchTerm={searchActions.setSearchTerm}
                    isSearching={searchState.isSearching}
                    onClearSearch={searchActions.clearSearch}
                />

                {/* Progress Bar for Video Processing */}
                <ProcessingProgressBar
                    show={libraryState.showProcessingProgress}
                    progress={libraryState.processingProgress}
                    currentIndexingFolder={libraryState.currentIndexingFolder}
                />

                {/* Progress Bar for Search */}
                <SearchProgressBar
                    show={searchState.isSearching}
                    progress={searchState.searchProgress}
                />

                {/* Content Area */}
                <div className="flex-1 p-6 overflow-auto">
                    {searchState.showSearchResults ? (
                        /* Search Results */
                        <SearchResults
                            isSearching={searchState.isSearching}
                            searchTerm={searchState.searchTerm}
                            searchResults={searchState.searchResults}
                            searchProgress={searchState.searchProgress}
                            onPlayVideo={videoPlayer.handlePlayVideo}
                            onContextMenu={contextMenuHook.handleContextMenu}
                            onOpenVideoDetails={handleOpenVideoDetails}
                        />
                    ) : navigationState.showHomePage && !videoLibraryState.selectedFolder ? (
                        /* Página Inicial */
                        <HomePage
                            libraryFolders={videoLibraryState.libraryFolders}
                            videosInProgress={videoLibraryState.videosInProgress}
                            recentVideos={videoLibraryState.recentVideos}
                            suggestedVideos={videoLibraryState.suggestedVideos}
                            libraryFoldersWithPreviews={videoLibraryState.libraryFoldersWithPreviews}
                            onAddFolder={libraryActions.handleAddFolder}
                            onPlayVideo={videoPlayer.handlePlayVideo}
                            onContextMenu={contextMenuHook.handleContextMenu}
                            onOpenVideoDetails={handleOpenVideoDetails}
                            onSelectFolder={handleSelectFolder}
                        />
                    ) : !videoLibraryState.selectedFolder ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor"
                                     viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-300 mb-2">Get Started</h3>
                            <p className="text-gray-400 mb-6 max-w-md">
                                Add folders containing your videos to start building your library.
                                Mnemo will scan and organize your videos while preserving your folder structure.
                            </p>
                            <button
                                onClick={libraryActions.handleAddFolder}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            >
                                Add Your First Folder
                            </button>
                        </div>
                    ) : (
                        <DirectoryView
                            loading={videoLibraryState.loading}
                            currentPath={navigationState.currentPath}
                            processedVideos={videoLibraryState.processedVideos}
                            directoryContents={navigationState.directoryContents}
                            videoProcessingState={videoProcessingState}
                            onPlayVideo={videoPlayer.handlePlayVideo}
                            onContextMenu={contextMenuHook.handleContextMenu}
                            onNavigateToDirectory={navigateToDirectory}
                            naturalSort={naturalSort}
                        />
                    )}
                </div>
            </div>

            {/* Video Details Modal */}
            <VideoDetailsModal
                show={modals.showVideoDetails}
                video={modals.selectedVideo}
                editingTitle={modals.editingTitle}
                editingDescription={modals.editingDescription}
                onClose={handleCloseVideoDetails}
                onSave={handleSaveVideoDetails}
                onCancel={handleCancelEdit}
                onTitleChange={modals.setEditingTitle}
                onDescriptionChange={modals.setEditingDescription}
            />

            {/* Context Menu */}
            <ContextMenu
                show={contextMenuHook.contextMenu.show}
                x={contextMenuHook.contextMenu.x}
                y={contextMenuHook.contextMenu.y}
                video={contextMenuHook.contextMenu.video}
                onPlayVideo={videoPlayer.handlePlayVideo}
                onOpenFile={contextMenuHook.handleOpenFile}
                onOpenWith={contextMenuHook.handleOpenWith}
                onToggleWatchedStatus={toggleVideoWatchedStatus}
                onOpenProperties={contextMenuHook.handleOpenProperties}
                onClose={contextMenuHook.handleCloseContextMenu}
            />

            {/* Internal Custom Video Player */}
            {videoPlayer.playingVideo && (
                <YouTubeStyleVideoPlayer
                    key={`${videoPlayer.playingVideo.file_path}-${videoPlayer.playingVideo.is_watched}-${videoPlayer.playingVideo.watch_progress_seconds}`}
                    video={videoPlayer.playingVideo}
                    playlistVideos={videoLibraryState.processedVideos}
                    isPlaying={videoPlayer.isPlaying}
                    currentTime={videoPlayer.currentTime}
                    duration={videoPlayer.duration}
                    volume={videoPlayer.volume}
                    playbackSpeed={videoPlayer.playbackSpeed}
                    isFullscreen={videoPlayer.isFullscreen}
                    showControls={videoPlayer.showControls}
                    subtitlesEnabled={videoPlayer.subtitlesEnabled}
                    subtitlesAvailable={videoPlayer.subtitlesAvailable}
                    currentSubtitle={videoPlayer.currentSubtitle}
                    isIconChanging={videoPlayer.isIconChanging}
                    onClose={videoPlayer.handleCloseVideoPlayer}
                    onTogglePlayPause={videoPlayer.togglePlayPause}
                    onSeek={videoPlayer.handleSeek}
                    onVolumeChange={videoPlayer.handleVolumeChange}
                    onSpeedChange={videoPlayer.handleSpeedChange}
                    onToggleFullscreen={videoPlayer.toggleFullscreen}
                    onToggleSubtitles={videoPlayer.toggleSubtitles}
                    onPlayVideo={videoPlayer.handlePlayVideo}
                    onVideoProgress={(video: ProcessedVideo, time: number) => {
                        videoPlayer.setCurrentTime(time);
                        videoPlayer.handleVideoProgress(video, time);
                    }}
                    onVideoEnded={() => {
                        videoPlayer.setIsPlaying(false);
                        // Find next playlist item and start countdown
                        if (videoPlayer.playingVideo) {
                            const currentIndex = videoLibraryState.processedVideos.findIndex((v: ProcessedVideo) => v.file_path === videoPlayer.playingVideo!.file_path);
                            if (currentIndex !== -1 && currentIndex < videoLibraryState.processedVideos.length - 1) {
                                const next = videoLibraryState.processedVideos[currentIndex + 1];
                                const currentPlaybackSettings = {
                                    speed: videoPlayer.playbackSpeed,
                                    volume: videoPlayer.volume,
                                    subtitlesEnabled: videoPlayer.subtitlesEnabled
                                };
                                modals.startNextVideoCountdown(next, currentPlaybackSettings);
                            }
                        }
                    }}
                    onLoadedMetadata={(videoDuration: number) => {
                        videoPlayer.setDuration(videoDuration);
                        // Playback rate & volume already applied by component
                    }}
                    onPlay={() => videoPlayer.setIsPlaying(true)}
                    onPause={() => videoPlayer.setIsPlaying(false)}
                    onToggleWatchedStatus={toggleVideoWatchedStatus}
                    onOpenProperties={handleOpenVideoDetails}
                    formatTime={formatTime}
                    resetControlsTimeout={videoPlayer.resetControlsTimeout}
                />
            )}

            {/* Next Video Modal */}
            <NextVideoModal
                show={modals.showNextVideoPrompt}
                nextVideo={modals.nextVideo}
                countdown={modals.nextVideoCountdown}
                savedSettings={modals.savedPlaybackSettings}
                onPlayNext={playNextVideo}
                onCancel={cancelNextVideo}
            />

            {/* Remove Folder Confirmation Modal */}
            <ConfirmRemovalModal
                show={modals.showRemoveConfirmation}
                folderToRemove={modals.folderToRemove}
                onConfirm={confirmRemoveFolder}
                onCancel={cancelRemoveFolder}
            />

            {/* Settings Modal */}
            {modals.showSettings && (
                <Settings
                    onClose={handleCloseSettings}
                    onLibraryChanged={handleLibraryChanged}
                />
            )}
        </div>
    );
}

export default App;
