import { useState } from 'react';

interface UseNavigationProps {
    setSelectedFolder: (folder: string | null) => void;
    setCurrentPath: (path: string) => void;
    setShowHomePage: (show: boolean) => void;
    loadDirectoryContents: (path: string) => void;
    loadHomePageData: () => Promise<void>;
}

export const useNavigation = ({
    setSelectedFolder,
    setCurrentPath,
    setShowHomePage,
    loadDirectoryContents,
    loadHomePageData
}: UseNavigationProps) => {
    const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    // Go to home page
    const goToHomePage = () => {
        setSelectedFolder(null);
        setShowHomePage(true);
        // Don't clear search term to keep it persistent
        loadHomePageData();
    };

    // Navigate to folder with history
    const navigateToFolder = (folderPath: string) => {
        // Add to history if we're not navigating through history
        if (historyIndex === navigationHistory.length - 1) {
            const newHistory = [...navigationHistory, folderPath];
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        } else {
            // If we're in the middle of history, remove later entries
            const newHistory = navigationHistory.slice(0, historyIndex + 1);
            newHistory.push(folderPath);
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        }

        setSelectedFolder(folderPath);
        setCurrentPath(folderPath);
        setShowHomePage(false);
        // Don't clear search term to keep it persistent
        loadDirectoryContents(folderPath);
    };

    // Go back in history
    const goBack = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const folderPath = navigationHistory[newIndex];
            setSelectedFolder(folderPath);
            setCurrentPath(folderPath);
            setShowHomePage(false);
            loadDirectoryContents(folderPath);
        } else if (historyIndex === 0) {
            // If we're at the first item in history, go to home page
            setHistoryIndex(-1);
            goToHomePage();
        }
    };

    // Go forward in history
    const goForward = () => {
        if (historyIndex < navigationHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const folderPath = navigationHistory[newIndex];
            setSelectedFolder(folderPath);
            setCurrentPath(folderPath);
            setShowHomePage(false);
            loadDirectoryContents(folderPath);
        }
    };

    // Check if can go back or forward
    const canGoBack = historyIndex > -1;
    const canGoForward = historyIndex < navigationHistory.length - 1;

    return {
        navigationHistory,
        historyIndex,
        canGoBack,
        canGoForward,
        goToHomePage,
        navigateToFolder,
        goBack,
        goForward
    };
};
