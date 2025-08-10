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

    // Perform search
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

            // If no folder is selected (home page), search only in indexed videos
            if (!selectedFolder) {
                results = await searchVideos(term);
            } else {
                // If there's a selected folder, use full recursive search
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

    // Clear search
    const clearSearch = () => {
        setSearchTerm("");
        setSearchResults([]);
        setShowSearchResults(false);

        // If no folder is selected, go to home page
        if (!selectedFolder) {
            onShowHomePage();
        }
    };

    // Debounce for automatic search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchTerm.trim()) {
                handleSearch(searchTerm);
            } else {
                // If searchTerm is empty, clear search and go to home page if necessary
                setSearchResults([]);
                setShowSearchResults(false);
                
                if (!selectedFolder) {
                    onShowHomePage();
                }
            }
        }, 300); // 300ms de delay

        return () => clearTimeout(timeoutId);
    }, [searchTerm, selectedFolder]);

    // Update a specific video in search results
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
