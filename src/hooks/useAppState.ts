import { useState, useCallback } from 'react';
import { ProcessedVideo } from '../services/videoProcessor';
import { VideoLibraryService } from '../services/VideoLibraryService';
import { getVideosInDirectoryOrderedByWatchStatus } from '../database';
import { invoke } from '@tauri-apps/api/core';

interface DirEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_video: boolean;
}

interface AppState {
    // Estados locais que ainda não estão no context
    currentPath: string;
    directoryContents: DirEntry[];
    loading: boolean;
    processedVideos: ProcessedVideo[];
    showVideoPlayer: boolean;
    showHomePage: boolean;
    
    // Estados da página inicial (serão migrados para context)
    recentVideos: ProcessedVideo[];
    videosInProgress: ProcessedVideo[];
    suggestedVideos: ProcessedVideo[];
    libraryFoldersWithPreviews: { folder: string; videos: ProcessedVideo[] }[];
}

interface AppActions {
    setCurrentPath: (path: string) => void;
    setDirectoryContents: (contents: DirEntry[]) => void;
    setLoading: (loading: boolean) => void;
    setProcessedVideos: (videos: ProcessedVideo[]) => void;
    setShowVideoPlayer: (show: boolean) => void;
    setShowHomePage: (show: boolean) => void;
    setRecentVideos: (videos: ProcessedVideo[]) => void;
    setVideosInProgress: (videos: ProcessedVideo[]) => void;
    setSuggestedVideos: (videos: ProcessedVideo[]) => void;
    setLibraryFoldersWithPreviews: (folders: { folder: string; videos: ProcessedVideo[] }[]) => void;
    
    // Ações compostas
    loadHomePageData: () => Promise<void>;
    loadDirectoryContents: (path: string) => Promise<void>;
    refreshCurrentDirectory: () => Promise<void>;
}

const initialState: AppState = {
    currentPath: '',
    directoryContents: [],
    loading: false,
    processedVideos: [],
    showVideoPlayer: false,
    showHomePage: true,
    recentVideos: [],
    videosInProgress: [],
    suggestedVideos: [],
    libraryFoldersWithPreviews: [],
};

export function useAppState() {
    const [state, setState] = useState<AppState>(initialState);

    // Setters básicos
    const setCurrentPath = useCallback((path: string) => {
        setState(prev => ({ ...prev, currentPath: path }));
    }, []);

    const setDirectoryContents = useCallback((contents: DirEntry[]) => {
        setState(prev => ({ ...prev, directoryContents: contents }));
    }, []);

    const setLoading = useCallback((loading: boolean) => {
        setState(prev => ({ ...prev, loading }));
    }, []);

    const setProcessedVideos = useCallback((videos: ProcessedVideo[]) => {
        setState(prev => ({ ...prev, processedVideos: videos }));
    }, []);

    const setShowVideoPlayer = useCallback((show: boolean) => {
        setState(prev => ({ ...prev, showVideoPlayer: show }));
    }, []);

    const setShowHomePage = useCallback((show: boolean) => {
        setState(prev => ({ ...prev, showHomePage: show }));
    }, []);

    const setRecentVideos = useCallback((videos: ProcessedVideo[]) => {
        setState(prev => ({ ...prev, recentVideos: videos }));
    }, []);

    const setVideosInProgress = useCallback((videos: ProcessedVideo[]) => {
        setState(prev => ({ ...prev, videosInProgress: videos }));
    }, []);

    const setSuggestedVideos = useCallback((videos: ProcessedVideo[]) => {
        setState(prev => ({ ...prev, suggestedVideos: videos }));
    }, []);

    const setLibraryFoldersWithPreviews = useCallback((folders: { folder: string; videos: ProcessedVideo[] }[]) => {
        setState(prev => ({ ...prev, libraryFoldersWithPreviews: folders }));
    }, []);

    // Ações compostas
    const loadHomePageData = useCallback(async () => {
        try {
            const homeData = await VideoLibraryService.loadHomePageData();
            
            setState(prev => ({
                ...prev,
                recentVideos: homeData.recentVideos,
                videosInProgress: homeData.videosInProgress,
                suggestedVideos: homeData.suggestedVideos,
                libraryFoldersWithPreviews: homeData.libraryFoldersWithPreviews,
            }));
        } catch (error) {
            console.error('Erro ao carregar dados da página inicial:', error);
        }
    }, []);

    const loadDirectoryContents = useCallback(async (path: string) => {
        setLoading(true);
        try {
            const contents: DirEntry[] = await invoke('read_directory', { path });
            setDirectoryContents(contents);
            setCurrentPath(path);

            // Carrega vídeos já processados do banco de dados, ordenados por status de visualização
            const existingVideos = await getVideosInDirectoryOrderedByWatchStatus(path);
            setProcessedVideos(existingVideos);
        } catch (error) {
            console.error('Erro ao carregar conteúdo do diretório:', error);
            setDirectoryContents([]);
        } finally {
            setLoading(false);
        }
    }, [setLoading, setDirectoryContents, setCurrentPath, setProcessedVideos]);

    const refreshCurrentDirectory = useCallback(async () => {
        if (state.currentPath) {
            await loadDirectoryContents(state.currentPath);
        }
    }, [state.currentPath, loadDirectoryContents]);

    const actions: AppActions = {
        setCurrentPath,
        setDirectoryContents,
        setLoading,
        setProcessedVideos,
        setShowVideoPlayer,
        setShowHomePage,
        setRecentVideos,
        setVideosInProgress,
        setSuggestedVideos,
        setLibraryFoldersWithPreviews,
        loadHomePageData,
        loadDirectoryContents,
        refreshCurrentDirectory,
    };

    return {
        state,
        actions,
    };
}
