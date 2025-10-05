import { useState } from "react";

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
    loadHomePageData,
}: UseNavigationProps) => {
    const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    const goToHomePage = () => {
        setSelectedFolder(null);
        setShowHomePage(true);
        loadHomePageData();
    };

    const navigateToFolder = (folderPath: string) => {
        if (historyIndex === navigationHistory.length - 1) {
            const newHistory = [...navigationHistory, folderPath];
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        } else {
            const newHistory = navigationHistory.slice(0, historyIndex + 1);
            newHistory.push(folderPath);
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        }

        setSelectedFolder(folderPath);
        setCurrentPath(folderPath);
        setShowHomePage(false);
        loadDirectoryContents(folderPath);
    };

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
            setHistoryIndex(-1);
            goToHomePage();
        }
    };

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
        goForward,
    };
};
