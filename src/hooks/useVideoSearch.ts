import { useState, useEffect } from 'react';
import { searchVideos, searchVideosRecursive } from '../database';
import { ProcessedVideo } from '../types/video';

export interface VideoSearchState {
    searchTerm: string;
    searchResults: ProcessedVideo[];
    isSearching: boolean;
    showSearchResults: boolean;
    searchProgress: {
        current: number;
        total: number;
        currentFile: string;
    };
}

export interface VideoSearchActions {
    handleSearch: (term: string) => Promise<void>;
    clearSearch: () => void;
    setSearchTerm: (term: string) => void;
    updateSearchResult: (updatedVideo: ProcessedVideo) => void;
}

interface UseVideoSearchProps {
    selectedFolder: string | null;
    onShowHomePage: () => void;
}

export const useVideoSearch = ({
    selectedFolder,
    onShowHomePage
}: UseVideoSearchProps): [VideoSearchState, VideoSearchActions] => {
    // Estados para funcionalidade de busca
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [searchResults, setSearchResults] = useState<ProcessedVideo[]>([]);
    const [isSearching, setIsSearching] = useState<boolean>(false);
    const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
    const [searchProgress, setSearchProgress] = useState<{
        current: number;
        total: number;
        currentFile: string;
    }>({ current: 0, total: 0, currentFile: "" });

    // Função para realizar busca
    const handleSearch = async (term: string) => {
        setSearchTerm(term);

        if (!term.trim()) {
            if (!selectedFolder) {
                onShowHomePage();
            }
            setShowSearchResults(false);
            setSearchResults([]);
            setSearchProgress({ current: 0, total: 0, currentFile: "" });
            return;
        }

        setIsSearching(true);
        setSearchProgress({ current: 0, total: 0, currentFile: "" });

        try {
            let results: ProcessedVideo[];

            // Se não há pasta selecionada (página inicial), busca apenas nos vídeos indexados
            if (!selectedFolder) {
                results = await searchVideos(term);
            } else {
                // Se há pasta selecionada, usa busca recursiva completa
                results = await searchVideosRecursive(term, (current, total, currentFile) => {
                    setSearchProgress({ current, total, currentFile });
                });
            }

            setSearchResults(results);
            setShowSearchResults(true);
        } catch (error) {
            console.error("Error searching videos:", error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
            setSearchProgress({ current: 0, total: 0, currentFile: "" });
        }
    };

    // Função para limpar busca
    const clearSearch = () => {
        setSearchTerm("");
        setSearchResults([]);
        setShowSearchResults(false);

        // Se não há pasta selecionada, volta à página inicial
        if (!selectedFolder) {
            onShowHomePage();
        }
    };

    // Debounce para busca automática
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchTerm.trim()) {
                handleSearch(searchTerm);
            } else {
                // Se searchTerm está vazio, limpa a busca e volta à página inicial se necessário
                setSearchResults([]);
                setShowSearchResults(false);
                
                if (!selectedFolder) {
                    onShowHomePage();
                }
            }
        }, 300); // 300ms de delay

        return () => clearTimeout(timeoutId);
    }, [searchTerm, selectedFolder]);

    // Função para atualizar um vídeo específico nos resultados de busca
    const updateSearchResult = (updatedVideo: ProcessedVideo) => {
        setSearchResults(prev => prev.map(video => 
            video.file_path === updatedVideo.file_path ? updatedVideo : video
        ));
    };

    const state: VideoSearchState = {
        searchTerm,
        searchResults,
        isSearching,
        showSearchResults,
        searchProgress
    };

    const actions: VideoSearchActions = {
        handleSearch,
        clearSearch,
        setSearchTerm,
        updateSearchResult
    };

    return [state, actions];
};
