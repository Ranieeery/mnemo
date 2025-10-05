import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProcessedVideo } from "../types/video";

interface UseContextMenuProps {
    onOpenVideoDetails: (video: ProcessedVideo) => void;
}

export const useContextMenu = ({ onOpenVideoDetails }: UseContextMenuProps) => {
    const [contextMenu, setContextMenu] = useState<{
        show: boolean;
        x: number;
        y: number;
        video: ProcessedVideo | null;
    }>({
        show: false,
        x: 0,
        y: 0,
        video: null,
    });

    const handleContextMenu = (event: React.MouseEvent, video: ProcessedVideo) => {
        event.preventDefault();
        setContextMenu({
            show: true,
            x: event.clientX,
            y: event.clientY,
            video: video,
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu({
            show: false,
            x: 0,
            y: 0,
            video: null,
        });
    };

    const handleOpenFile = async (filePath: string) => {
        try {
            await invoke("open_file_externally", { filePath });
            handleCloseContextMenu();
        } catch (error) {
            console.error("Error opening file:", error);
            alert("Error opening file. Please check if the file exists.");
        }
    };

    const handleOpenWith = async (filePath: string) => {
        try {
            await invoke("open_file_with_dialog", { filePath });
            handleCloseContextMenu();
        } catch (error) {
            console.error("Error opening file dialog:", error);
            alert("Error opening file dialog.");
        }
    };

    const handleOpenProperties = (video: ProcessedVideo) => {
        handleCloseContextMenu();
        onOpenVideoDetails(video);
    };

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.show) {
                handleCloseContextMenu();
            }
        };

        document.addEventListener("click", handleClickOutside);
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    }, [contextMenu.show]);

    return {
        contextMenu,

        handleContextMenu,
        handleCloseContextMenu,
        handleOpenFile,
        handleOpenWith,
        handleOpenProperties,
    };
};
