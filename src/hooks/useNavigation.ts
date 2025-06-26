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

    // Função para voltar à página inicial
    const goToHomePage = () => {
        setSelectedFolder(null);
        setShowHomePage(true);
        // Não limpa o termo de busca para mantê-lo persistente
        loadHomePageData();
    };

    // Função para navegar para uma pasta com histórico
    const navigateToFolder = (folderPath: string) => {
        // Adiciona à história se não estivermos navegando pelo histórico
        if (historyIndex === navigationHistory.length - 1) {
            const newHistory = [...navigationHistory, folderPath];
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        } else {
            // Se estivermos no meio da história, remove entradas posteriores
            const newHistory = navigationHistory.slice(0, historyIndex + 1);
            newHistory.push(folderPath);
            setNavigationHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
        }

        setSelectedFolder(folderPath);
        setCurrentPath(folderPath);
        setShowHomePage(false);
        // Não limpa o termo de busca para mantê-lo persistente
        loadDirectoryContents(folderPath);
    };

    // Função para voltar no histórico
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
            // Se estamos no primeiro item da história, volta à página inicial
            setHistoryIndex(-1);
            goToHomePage();
        }
    };

    // Função para avançar no histórico
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

    // Verifica se pode voltar ou avançar
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
