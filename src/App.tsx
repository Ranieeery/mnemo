import {useEffect, useState} from "react";
import {
    getLibraryFolders,
    getVideosInDirectoryOrderedByWatchStatus,
    saveLibraryFolder,
    updateWatchProgress
} from "./database";
import {checkVideoToolsAvailable, ProcessedVideo} from "./services/videoProcessor";
import {Settings} from "./components/Settings";
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
import VideoPlayer from "./components/VideoPlayer/VideoPlayer";
import DirectoryView from "./components/DirectoryView/DirectoryView";
import { useLibraryManagement } from "./hooks/useLibraryManagement";
import { useVideoProcessing } from "./hooks/useVideoProcessing";
import { useVideoSearch } from "./hooks/useVideoSearch";
import { useVideoWatchedStatus } from "./hooks/useVideoWatchedStatus";
import { useNavigation } from "./hooks/useNavigation";
import { useVideoPlayer } from "./hooks/useVideoPlayer";
import { useModals } from "./hooks/useModals";
import { useContextMenu } from "./hooks/useContextMenu";
import { useVideoLibrary } from "./contexts/VideoLibraryContext";
import { useAppState } from "./hooks/useAppState";
// import { useNavigation as useNavigationContext } from "./contexts/NavigationContext";
import "./styles/player.css";

// Função para ordenação natural (numérica) de strings
const naturalSort = (a: string, b: string): number => {
    return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
    });
};

function App() {
    // Context hooks
    const { state: videoLibraryState, actions: videoLibraryActions } = useVideoLibrary();
    
    // Hook de estado centralizado
    const { state: appState, actions: appActions } = useAppState();
    
    // Estados locais mantidos para compatibilidade (serão migrados gradualmente)
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [libraryFolders, setLibraryFolders] = useState<string[]>([]);
    const [videoToolsAvailable, setVideoToolsAvailable] = useState<{
        ffmpeg: boolean;
        ffprobe: boolean
    }>({ffmpeg: false, ffprobe: false});



    // Função para carregar dados da página inicial
    const loadHomePageData = async () => {
        await appActions.loadHomePageData();
    };

    // Hook para gerenciamento da biblioteca
    const [libraryState, libraryActions] = useLibraryManagement({
        videoToolsAvailable,
        libraryFolders,
        setLibraryFolders,
        loadHomePageData
    });

    // Hook para processamento de vídeos
    const [videoProcessingState, videoProcessingActions] = useVideoProcessing({
        setProcessedVideos: appActions.setProcessedVideosReact
    });

    // Hook para busca de vídeos
    const [searchState, searchActions] = useVideoSearch({
        selectedFolder,
        onShowHomePage: () => {
            appActions.setShowHomePage(true);
            loadHomePageData();
        }
    });

    // Hook para gerenciar status de vídeos assistidos
    const { toggleVideoWatchedStatus } = useVideoWatchedStatus({
        setProcessedVideos: appActions.setProcessedVideosReact,
        setRecentVideos: appActions.setRecentVideosReact,
        setVideosInProgress: appActions.setVideosInProgressReact,
        setSuggestedVideos: appActions.setSuggestedVideosReact,
        loadHomePageData,
        selectedFolder,
        searchState,
        searchActions
    });

    // Carregar pastas do banco de dados na inicialização
    useEffect(() => {
        const initializeApp = async () => {
            try {
                // Initialize using context
                await videoLibraryActions.initializeLibrary();
                
                // Set local state from context
                setLibraryFolders(videoLibraryState.libraryFolders);
                appActions.setRecentVideos(videoLibraryState.recentVideos);
                appActions.setVideosInProgress(videoLibraryState.videosInProgress);
                appActions.setSuggestedVideos(videoLibraryState.suggestedVideos);
                appActions.setLibraryFoldersWithPreviews(videoLibraryState.libraryFoldersWithPreviews);

                // Verifica se as ferramentas de vídeo estão disponíveis
                const tools = await checkVideoToolsAvailable();
                setVideoToolsAvailable(tools);

                if (!tools.ffmpeg || !tools.ffprobe) {
                    console.warn('Video tools not available. Video processing will be limited.');
                }

                // Migrar dados do localStorage se existirem
                const savedFoldersLegacy = localStorage.getItem('libraryFolders');
                if (savedFoldersLegacy) {
                    const legacyFolders = JSON.parse(savedFoldersLegacy);
                    for (const folder of legacyFolders) {
                        await saveLibraryFolder(folder);
                    }
                    localStorage.removeItem('libraryFolders');
                    // Recarregar após migração
                    await videoLibraryActions.loadLibraryFolders();
                    await videoLibraryActions.loadHomePageData();
                }
            } catch (error) {
                console.error('Failed to initialize app:', error);
                // Fallback para localStorage em caso de erro
                const savedFolders = localStorage.getItem('libraryFolders');
                if (savedFolders) {
                    setLibraryFolders(JSON.parse(savedFolders));
                }
            }
        };

        initializeApp();
    }, []);

    // Sincronizar estado do contexto com estado local
    useEffect(() => {
        setLibraryFolders(videoLibraryState.libraryFolders);
        appActions.setRecentVideos(videoLibraryState.recentVideos);
        appActions.setVideosInProgress(videoLibraryState.videosInProgress);
        appActions.setSuggestedVideos(videoLibraryState.suggestedVideos);
        appActions.setLibraryFoldersWithPreviews(videoLibraryState.libraryFoldersWithPreviews);
        appActions.setProcessedVideos(videoLibraryState.processedVideos);
        setSelectedFolder(videoLibraryState.selectedFolder);
    }, [videoLibraryState, appActions]);

    // Função para selecionar uma pasta na sidebar
    const handleSelectFolder = (folder: string) => {
        navigation.navigateToFolder(folder);
    };

    // Função para abrir modal de confirmação de remoção
    const handleRemoveFolderRequest = (folderPath: string) => {
        modals.handleRemoveFolderRequest(folderPath);
    };

    // Função para confirmar remoção da pasta
    const confirmRemoveFolder = async () => {
        await modals.confirmRemoveFolder();
    };

    // Função para cancelar remoção
    const cancelRemoveFolder = () => {
        modals.cancelRemoveFolder();
    };

    // Função para carregar o conteúdo de um diretório
    const loadDirectoryContents = async (path: string) => {
        await appActions.loadDirectoryContents(path);
        
        // Processa vídeos em segundo plano se as ferramentas estão disponíveis
        if (videoToolsAvailable.ffmpeg && videoToolsAvailable.ffprobe) {
            videoProcessingActions.processVideosInBackground(path);
        }
    };

    // Hook para navegação
    const navigation = useNavigation({
        setSelectedFolder,
        setCurrentPath: appActions.setCurrentPath,
        setShowHomePage: appActions.setShowHomePage,
        loadDirectoryContents,
        loadHomePageData
    });

    // Hook para o player de vídeo
    const videoPlayer = useVideoPlayer({
        setShowVideoPlayer: appActions.setShowVideoPlayerReact,
        updateWatchProgress,
        setProcessedVideos: appActions.setProcessedVideosReact,
        loadHomePageData
    });

    // Função para navegar para um diretório
    const navigateToDirectory = (path: string) => {
        navigation.navigateToFolder(path);
    };

    // Função para abrir o modal de detalhes do vídeo
    const handleOpenVideoDetails = (video: ProcessedVideo) => {
        modals.handleOpenVideoDetails(video);
    };

    // Função para fechar o modal de detalhes do vídeo
    const handleCloseVideoDetails = () => {
        modals.handleCloseVideoDetails();
    };

    // Função para salvar as alterações do vídeo
    const handleSaveVideoDetails = async () => {
        await modals.handleSaveVideoDetails();
    };

    // Função para cancelar a edição
    const handleCancelEdit = () => {
        modals.handleCancelEdit();
    };





    // Suporte para botões do mouse (voltar/avançar)
    useEffect(() => {
        const handleMouseButtons = (event: MouseEvent) => {
            if (event.button === 3) { // Botão "voltar" do mouse
                event.preventDefault();
                if (navigation.canGoBack) {
                    navigation.goBack();
                }
            } else if (event.button === 4) { // Botão "avançar" do mouse
                event.preventDefault();
                if (navigation.canGoForward) {
                    navigation.goForward();
                }
            }
        };

        document.addEventListener('mousedown', handleMouseButtons);
        return () => {
            document.removeEventListener('mousedown', handleMouseButtons);
        };
    }, [navigation.canGoBack, navigation.canGoForward]);

    // Suporte para teclas de atalho de navegação
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Alt + seta esquerda = voltar
            if (event.altKey && event.key === 'ArrowLeft') {
                event.preventDefault();
                if (navigation.canGoBack) {
                    navigation.goBack();
                }
            }
            // Alt + seta direita = avançar
            else if (event.altKey && event.key === 'ArrowRight') {
                event.preventDefault();
                if (navigation.canGoForward) {
                    navigation.goForward();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [navigation.canGoBack, navigation.canGoForward]);

    // Função para abrir configurações
    const handleOpenSettings = () => {
        modals.handleOpenSettings();
    };

    // Função para fechar configurações
    const handleCloseSettings = () => {
        modals.handleCloseSettings();
    };

    // Função chamada após importação de biblioteca (para recarregar dados)
    const handleLibraryChanged = async () => {
        // Recarregar pastas da biblioteca
        const updatedFolders = await getLibraryFolders();
        setLibraryFolders(updatedFolders);

        // Recarregar dados da página inicial
        if (appState.showHomePage) {
            await loadHomePageData();
        }

        // Se estiver em uma pasta, recarregar seus vídeos
        if (selectedFolder) {
            appActions.setProcessedVideos([]);
            const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(selectedFolder);
            appActions.setProcessedVideos(existingVideos);
        }

        // Limpar busca se estiver ativa
        if (searchState.searchTerm) {
            searchActions.clearSearch();
        }
    };

    // Hook para modais
    const modals = useModals({
        setProcessedVideos: appActions.setProcessedVideosReact,
        libraryActions,
        navigation,
        videoPlayer,
        selectedFolder,
        handleLibraryChanged
    });

    // Hook para menu de contexto
    const contextMenuHook = useContextMenu({
        onOpenVideoDetails: handleOpenVideoDetails
    });

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Função para reproduzir o próximo vídeo
    const playNextVideo = async () => {
        await modals.playNextVideo();
    };

    // Função para cancelar próximo vídeo
    const cancelNextVideo = () => {
        modals.cancelNextVideo();
    };

    return (
        <div className="h-screen bg-gray-900 text-white flex">
            {/* Sidebar */}
            <Sidebar
                libraryFolders={libraryFolders}
                selectedFolder={selectedFolder}
                folderIndexingStatus={libraryState.folderIndexingStatus}
                onAddFolder={libraryActions.handleAddFolder}
                onSelectFolder={handleSelectFolder}
                onRemoveFolderRequest={handleRemoveFolderRequest}
                onGoToHomePage={navigation.goToHomePage}
                onOpenSettings={handleOpenSettings}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col">
                {/* Top Bar */}
                <TopBar
                    selectedFolder={selectedFolder}
                    canGoBack={navigation.canGoBack}
                    canGoForward={navigation.canGoForward}
                    onGoBack={navigation.goBack}
                    onGoForward={navigation.goForward}
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
                    ) : appState.showHomePage && !selectedFolder ? (
                        /* Página Inicial */
                        <HomePage
                            libraryFolders={libraryFolders}
                            videosInProgress={appState.videosInProgress}
                            recentVideos={appState.recentVideos}
                            suggestedVideos={appState.suggestedVideos}
                            libraryFoldersWithPreviews={appState.libraryFoldersWithPreviews}
                            onAddFolder={libraryActions.handleAddFolder}
                            onPlayVideo={videoPlayer.handlePlayVideo}
                            onContextMenu={contextMenuHook.handleContextMenu}
                            onOpenVideoDetails={handleOpenVideoDetails}
                            onSelectFolder={handleSelectFolder}
                        />
                    ) : !selectedFolder ? (
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
                            loading={appState.loading}
                            currentPath={appState.currentPath}
                            processedVideos={appState.processedVideos}
                            directoryContents={appState.directoryContents}
                            videoProcessingState={videoProcessingState}
                            onPlayVideo={videoPlayer.handlePlayVideo}
                            onContextMenu={contextMenuHook.handleContextMenu}
                            onNavigateToDirectory={navigateToDirectory}
                            naturalSort={naturalSort}
                        />
                    )}
                </div>
            </div>

            {/* Modal para detalhes do vídeo */}
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

            {/* Menu de contexto */}
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

            {/* Player de Vídeo Interno Customizado */}
            {appState.showVideoPlayer && videoPlayer.playingVideo && (
                <VideoPlayer
                    video={videoPlayer.playingVideo}
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
                    onVideoProgress={(video, time) => {
                        videoPlayer.setCurrentTime(time);
                        videoPlayer.handleVideoProgress(video, time);
                    }}
                    onVideoEnded={() => {
                        videoPlayer.setIsPlaying(false);
                        // Procura o próximo vídeo e inicia o countdown
                        if (videoPlayer.playingVideo) {
                            const currentIndex = appState.processedVideos.findIndex((v: ProcessedVideo) => v.file_path === videoPlayer.playingVideo!.file_path);
                            if (currentIndex !== -1 && currentIndex < appState.processedVideos.length - 1) {
                                const next = appState.processedVideos[currentIndex + 1];
                                const currentPlaybackSettings = {
                                    speed: videoPlayer.playbackSpeed,
                                    volume: videoPlayer.volume,
                                    subtitlesEnabled: videoPlayer.subtitlesEnabled
                                };
                                modals.startNextVideoCountdown(next, currentPlaybackSettings);
                            }
                        }
                    }}
                    onLoadedMetadata={(videoDuration) => {
                        videoPlayer.setDuration(videoDuration);
                        // O playbackRate e volume já são setados no componente
                    }}
                    onPlay={() => videoPlayer.setIsPlaying(true)}
                    onPause={() => videoPlayer.setIsPlaying(false)}
                    formatTime={formatTime}
                    resetControlsTimeout={videoPlayer.resetControlsTimeout}
                />
            )}

            {/* Modal de Próximo Vídeo */}
            <NextVideoModal
                show={modals.showNextVideoPrompt}
                nextVideo={modals.nextVideo}
                countdown={modals.nextVideoCountdown}
                savedSettings={modals.savedPlaybackSettings}
                onPlayNext={playNextVideo}
                onCancel={cancelNextVideo}
            />

            {/* Modal de Confirmação de Remoção */}
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
