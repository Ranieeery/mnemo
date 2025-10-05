import { useEffect, useState } from "react";
import { invoke } from '@tauri-apps/api/core';
import { saveLibraryFolder, updateWatchProgress, markAllVideosInFolderAsWatched, getFolderStats } from "./database";
import { checkVideoToolsAvailable } from "./services/videoProcessor";
import { ProcessedVideo } from "./types/video";
import { VideoLibraryService } from "./services/VideoLibraryService";
import { getVideosInDirectoryOrderedByWatchStatus } from "./database";
import { Settings } from "./components/Settings";
import ProcessingProgressBar from "./components/Progress/ProcessingProgressBar";
import SearchProgressBar from "./components/Progress/SearchProgressBar";
import TopBar from "./components/Navigation/TopBar";
import Sidebar from "./components/Sidebar/Sidebar";
import ConfirmRemovalModal from "./components/Modals/ConfirmRemovalModal";
import ConfirmMarkAllWatchedModal from "./components/Modals/ConfirmMarkAllWatchedModal";
import NextVideoModal from "./components/Modals/NextVideoModal";
import VideoDetailsModal from "./components/Modals/VideoDetailsModal";
import ContextMenu from "./components/ContextMenu/ContextMenu";
import FolderContextMenu from "./components/ContextMenu/FolderContextMenu";
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

const naturalSort = (a: string, b: string): number => {
    return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
    });
};

function App() {
    const { state: videoLibraryState, actions: videoLibraryActions } = useVideoLibrary();
    const { state: navigationState, actions: navigationActions, computed: navigationComputed } = useNavigationContext();
    
    const [videoToolsAvailable, setVideoToolsAvailable] = useState<{
        ffmpeg: boolean;
        ffprobe: boolean
    }>({ ffmpeg: false, ffprobe: false });

    const [showMarkAllWatchedModal, setShowMarkAllWatchedModal] = useState(false);
    const [selectedFolderForMarkAll, setSelectedFolderForMarkAll] = useState<{
        path: string;
        name: string;
        totalVideos: number;
        unwatchedVideos: number;
    } | null>(null);

    const [folderContextMenu, setFolderContextMenu] = useState<{
        show: boolean;
        x: number;
        y: number;
        folderPath: string;
        folderName: string;
    }>({
        show: false,
        x: 0,
        y: 0,
        folderPath: '',
        folderName: ''
    });

    const [libraryState, libraryActions] = useLibraryManagement({
        videoToolsAvailable,
        libraryFolders: videoLibraryState.libraryFolders,
        setLibraryFolders: (folders: string[]) => {
            for (const folder of folders) {
                if (!videoLibraryState.libraryFolders.includes(folder)) {
                    videoLibraryActions.addLibraryFolder(folder);
                }
            }
        },
        loadHomePageData: videoLibraryActions.loadHomePageData
    });

    const [videoProcessingState, videoProcessingActions] = useVideoProcessing({
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact
    });

    const handleGoHome = () => {
        navigationActions.goToHome();
        videoLibraryActions.selectFolder(null);
        videoLibraryActions.loadHomePageData();
    };

    const playFromHome = async (video: ProcessedVideo, fallbackList: ProcessedVideo[]) => {
        const path = video.file_path;
        const lastSlash = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
        let directory = '';
        if (lastSlash !== -1) {
            directory = path.substring(0, lastSlash + 1);
        }

        let playlist: ProcessedVideo[] = fallbackList;
        try {
            if (directory) {
                playlist = await getVideosInDirectoryOrderedByWatchStatus(directory);
            }
        } catch (e) {
            console.warn('Failed to load directory playlist, using fallback list', e);
        }

        if (!playlist.find(v => v.file_path === video.file_path)) {
            playlist = [video, ...playlist];
        }

        videoLibraryActions.setProcessedVideosReact(playlist);
        videoPlayer.handlePlayVideo(video);
    };

    const [searchState, searchActions] = useVideoSearch({
        selectedFolder: videoLibraryState.selectedFolder,
        onShowHomePage: handleGoHome
    });

    let toggleVideoWatchedStatus: (video: ProcessedVideo) => Promise<void>;

    useEffect(() => {
        const initializeApp = async () => {
            try {
                await videoLibraryActions.initializeLibrary();

                const tools = await checkVideoToolsAvailable();
                setVideoToolsAvailable(tools);

                if (!tools.ffmpeg || !tools.ffprobe) console.warn('Video tools not available. Video processing will be limited.');

                const savedFoldersLegacy = localStorage.getItem('libraryFolders');
                if (savedFoldersLegacy) {
                    const legacyFolders = JSON.parse(savedFoldersLegacy);
                    for (const folder of legacyFolders) {
                        await saveLibraryFolder(folder);
                        videoLibraryActions.addLibraryFolder(folder);
                    }
                    localStorage.removeItem('libraryFolders');
                    await videoLibraryActions.loadLibraryFolders();
                    await videoLibraryActions.loadHomePageData();
                }
            } catch (error) {
                console.error('Failed to initialize application:', error);
                videoLibraryActions.setError('Failed to initialize application');
            }
        };

        initializeApp();
    }, []);

    const handleSelectFolder = (folder: string) => {
        navigationActions.navigateTo(folder);
        videoLibraryActions.selectFolder(folder);
        loadDirectoryContents(folder);
    };

    const handleRemoveFolderRequest = (folderPath: string) => {
        modals.handleRemoveFolderRequest(folderPath);
    };

    const confirmRemoveFolder = async () => {
        await modals.confirmRemoveFolder();
    };

    const cancelRemoveFolder = () => {
        modals.cancelRemoveFolder();
    };

    const loadDirectoryContents = async (path: string) => {
        try {
            videoLibraryActions.setLoading(true);
            
            const processedVideos = await VideoLibraryService.getVideosInDirectory(path);
            videoLibraryActions.setProcessedVideos(processedVideos);
            
            const directoryContents: any[] = await invoke('read_directory', { path });
            navigationActions.setDirectoryContents(directoryContents);
            
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

    useEffect(() => {
        if (!navigationState.showHomePage && navigationState.currentPath) {
            if (videoLibraryState.selectedFolder !== navigationState.currentPath) {
                videoLibraryActions.selectFolder(navigationState.currentPath);
                loadDirectoryContents(navigationState.currentPath);
            }
        }
    }, [navigationState.currentPath, navigationState.showHomePage]);

    const videoPlayer = useVideoPlayer({
        setShowVideoPlayer: (_show: boolean) => {
        },
        updateWatchProgress,
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact,
        loadHomePageData: videoLibraryActions.loadHomePageData
    });

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

    const navigateToDirectory = (path: string) => {
        navigationActions.navigateTo(path);
        loadDirectoryContents(path);
    };

    const handleOpenVideoDetails = (video: ProcessedVideo) => {
        modals.handleOpenVideoDetails(video);
    };

    const handleCloseVideoDetails = () => {
        modals.handleCloseVideoDetails();
    };

    const handleSaveVideoDetails = async () => {
        await modals.handleSaveVideoDetails();
    };

    const handleCancelEdit = () => {
        modals.handleCancelEdit();
    };





    useEffect(() => {
        const handleMouseButtons = (event: MouseEvent) => {
            if (event.button === 3) {
                event.preventDefault();
                if (navigationComputed.canGoBack) {
                    navigationActions.goBack();
                }
            } else if (event.button === 4) {
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

    useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (videoPlayer.playingVideo) {
                    videoPlayer.handleCloseVideoPlayer();
                }
                return;
            }

            if (event.altKey && event.key === 'ArrowLeft') {
                event.preventDefault();
                if (navigationComputed.canGoBack) {
                    navigationActions.goBack();
                }
            }
            else if (event.altKey && event.key === 'ArrowRight') {
                event.preventDefault();
                if (navigationComputed.canGoForward) {
                    navigationActions.goForward();
                }
            }
        };

        const handlePointerDown = (event: MouseEvent) => {
            if (event.button === 3) {
                if (videoPlayer.playingVideo) {
                    videoPlayer.handleCloseVideoPlayer();
                }
            } else if (event.button === 4) {
                if (!videoPlayer.playingVideo) {
                    videoPlayer.reopenLastVideo?.();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [navigationComputed.canGoBack, navigationComputed.canGoForward, videoPlayer.playingVideo, videoPlayer.handleCloseVideoPlayer]);

    const handleOpenSettings = () => {
        modals.handleOpenSettings();
    };

    const handleCloseSettings = () => {
        modals.handleCloseSettings();
    };

    const handleLibraryChanged = async () => {
        await videoLibraryActions.loadLibraryFolders();

        if (navigationState.showHomePage) {
            await videoLibraryActions.loadHomePageData();
        }

        if (videoLibraryState.selectedFolder) {
            videoLibraryActions.setProcessedVideos([]);
        }

        if (searchState.searchTerm) {
            searchActions.clearSearch();
        }
    };

    const modals = useModals({
        setProcessedVideos: videoLibraryActions.setProcessedVideosReact,
        libraryActions,
        navigation: { goToHomePage: handleGoHome },
        videoPlayer,
        selectedFolder: videoLibraryState.selectedFolder,
        handleLibraryChanged
    });

    const contextMenuHook = useContextMenu({
        onOpenVideoDetails: handleOpenVideoDetails
    });

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const playNextVideo = async () => {
        await modals.playNextVideo();
    };

    const cancelNextVideo = () => {
        modals.cancelNextVideo();
    };

    const handleFolderContextMenu = async (event: React.MouseEvent, folderPath: string, folderName: string) => {
        event.preventDefault();
        
        setFolderContextMenu({
            show: true,
            x: event.clientX,
            y: event.clientY,
            folderPath: folderPath,
            folderName: folderName
        });
    };

    const handleCloseFolderContextMenu = () => {
        setFolderContextMenu({
            show: false,
            x: 0,
            y: 0,
            folderPath: '',
            folderName: ''
        });
    };

    const handleMarkAllAsWatchedRequest = async () => {
        if (!folderContextMenu.folderPath) return;
        
        try {
            const stats = await getFolderStats(folderContextMenu.folderPath);
            setSelectedFolderForMarkAll({
                path: folderContextMenu.folderPath,
                name: folderContextMenu.folderName,
                totalVideos: stats.totalVideos,
                unwatchedVideos: stats.totalVideos - stats.watchedVideos
            });
            setShowMarkAllWatchedModal(true);
        } catch (error) {
            console.error('Error getting folder stats:', error);
        }
    };

    const handleConfirmMarkAllWatched = async () => {
        if (!selectedFolderForMarkAll) return;

        try {
            await markAllVideosInFolderAsWatched(selectedFolderForMarkAll.path);
            setShowMarkAllWatchedModal(false);
            setSelectedFolderForMarkAll(null);
            
            if (navigationState.currentPath) {
                loadDirectoryContents(navigationState.currentPath);
            }
        } catch (error) {
            console.error('Error marking all as watched:', error);
            alert('Erro ao marcar vídeos como assistidos');
        }
    };

    const handleCancelMarkAllWatched = () => {
        setShowMarkAllWatchedModal(false);
        setSelectedFolderForMarkAll(null);
    };

    useEffect(() => {
        const handleClickOutside = () => {
            if (folderContextMenu.show) {
                handleCloseFolderContextMenu();
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [folderContextMenu.show]);

    return (
        <div className="h-screen bg-gray-900 text-white flex">
            <Sidebar
                libraryFolders={videoLibraryState.libraryFolders}
                selectedFolder={videoLibraryState.selectedFolder}
                folderIndexingStatus={libraryState.folderIndexingStatus}
                onAddFolder={libraryActions.handleAddFolder}
                onSelectFolder={handleSelectFolder}
                onRemoveFolderRequest={handleRemoveFolderRequest}
                onGoToHomePage={handleGoHome}
                onOpenSettings={handleOpenSettings}
            />

            <div className="flex-1 flex flex-col">
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

                <ProcessingProgressBar
                    show={libraryState.showProcessingProgress}
                    progress={libraryState.processingProgress}
                    currentIndexingFolder={libraryState.currentIndexingFolder}
                />

                <SearchProgressBar
                    show={searchState.isSearching}
                    progress={searchState.searchProgress}
                />

                <div className="flex-1 p-6 overflow-auto">
                    {searchState.showSearchResults ? (
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
                        <HomePage
                            libraryFolders={videoLibraryState.libraryFolders}
                            videosInProgress={videoLibraryState.videosInProgress}
                            recentVideos={videoLibraryState.recentVideos}
                            suggestedVideos={videoLibraryState.suggestedVideos}
                            libraryFoldersWithPreviews={videoLibraryState.libraryFoldersWithPreviews}
                            onAddFolder={libraryActions.handleAddFolder}
                            onPlayVideo={async (video: ProcessedVideo, list?: ProcessedVideo[]) => {
                                const baseList = list && list.length ? list : (videoLibraryState.suggestedVideos.length ? videoLibraryState.suggestedVideos : [video]);
                                await playFromHome(video, baseList);
                            }}
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
                            libraryFolders={videoLibraryState.libraryFolders}
                            videoProcessingState={videoProcessingState}
                            onPlayVideo={videoPlayer.handlePlayVideo}
                            onContextMenu={contextMenuHook.handleContextMenu}
                            onNavigateToDirectory={navigateToDirectory}
                            onFolderContextMenu={handleFolderContextMenu}
                            naturalSort={naturalSort}
                        />
                    )}
                </div>
            </div>

            <FolderContextMenu
                show={folderContextMenu.show}
                x={folderContextMenu.x}
                y={folderContextMenu.y}
                folderName={folderContextMenu.folderName}
                onMarkAllAsWatched={handleMarkAllAsWatchedRequest}
                onClose={handleCloseFolderContextMenu}
            />

            <ConfirmMarkAllWatchedModal
                show={showMarkAllWatchedModal}
                folderName={selectedFolderForMarkAll?.name || ''}
                totalVideos={selectedFolderForMarkAll?.totalVideos || 0}
                unwatchedVideos={selectedFolderForMarkAll?.unwatchedVideos || 0}
                onConfirm={handleConfirmMarkAllWatched}
                onCancel={handleCancelMarkAllWatched}
            />

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
                    }}
                    onPlay={() => videoPlayer.setIsPlaying(true)}
                    onPause={() => videoPlayer.setIsPlaying(false)}
                    onToggleWatchedStatus={toggleVideoWatchedStatus}
                    onOpenProperties={handleOpenVideoDetails}
                    formatTime={formatTime}
                    resetControlsTimeout={videoPlayer.resetControlsTimeout}
                />
            )}

            <NextVideoModal
                show={modals.showNextVideoPrompt}
                nextVideo={modals.nextVideo}
                countdown={modals.nextVideoCountdown}
                savedSettings={modals.savedPlaybackSettings}
                onPlayNext={playNextVideo}
                onCancel={cancelNextVideo}
            />

            <ConfirmRemovalModal
                show={modals.showRemoveConfirmation}
                folderToRemove={modals.folderToRemove}
                onConfirm={confirmRemoveFolder}
                onCancel={cancelRemoveFolder}
            />

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
