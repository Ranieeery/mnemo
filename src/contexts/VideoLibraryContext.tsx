import { createContext, useContext, ReactNode, useReducer } from "react";
import { ProcessedVideo } from "../types/video";
import {
    getLibraryFolders,
    getRecentlyWatchedVideos,
    getVideosInProgress,
    getUnwatchedVideos,
    getLibraryFoldersWithPreviews,
    initDatabase,
} from "../database";

export interface VideoLibraryState {
    libraryFolders: string[];
    recentVideos: ProcessedVideo[];
    videosInProgress: ProcessedVideo[];
    suggestedVideos: ProcessedVideo[];
    libraryFoldersWithPreviews: { folder: string; videos: ProcessedVideo[] }[];
    selectedFolder: string | null;
    processedVideos: ProcessedVideo[];
    loading: boolean;
    error: string | null;
}

export type VideoLibraryAction =
    | { type: "SET_LIBRARY_FOLDERS"; payload: string[] }
    | { type: "SET_RECENT_VIDEOS"; payload: ProcessedVideo[] }
    | { type: "SET_VIDEOS_IN_PROGRESS"; payload: ProcessedVideo[] }
    | { type: "SET_SUGGESTED_VIDEOS"; payload: ProcessedVideo[] }
    | { type: "SET_LIBRARY_FOLDERS_WITH_PREVIEWS"; payload: { folder: string; videos: ProcessedVideo[] }[] }
    | { type: "SET_SELECTED_FOLDER"; payload: string | null }
    | { type: "SET_PROCESSED_VIDEOS"; payload: ProcessedVideo[] }
    | { type: "SET_LOADING"; payload: boolean }
    | { type: "SET_ERROR"; payload: string | null }
    | { type: "ADD_LIBRARY_FOLDER"; payload: string }
    | { type: "REMOVE_LIBRARY_FOLDER"; payload: string }
    | { type: "UPDATE_PROCESSED_VIDEO"; payload: ProcessedVideo }
    | { type: "CLEAR_ERROR" };

const initialState: VideoLibraryState = {
    libraryFolders: [],
    recentVideos: [],
    videosInProgress: [],
    suggestedVideos: [],
    libraryFoldersWithPreviews: [],
    selectedFolder: null,
    processedVideos: [],
    loading: false,
    error: null,
};

function videoLibraryReducer(state: VideoLibraryState, action: VideoLibraryAction): VideoLibraryState {
    switch (action.type) {
        case "SET_LIBRARY_FOLDERS":
            return { ...state, libraryFolders: action.payload };
        case "SET_RECENT_VIDEOS":
            return { ...state, recentVideos: action.payload };
        case "SET_VIDEOS_IN_PROGRESS":
            return { ...state, videosInProgress: action.payload };
        case "SET_SUGGESTED_VIDEOS":
            return { ...state, suggestedVideos: action.payload };
        case "SET_LIBRARY_FOLDERS_WITH_PREVIEWS":
            return { ...state, libraryFoldersWithPreviews: action.payload };
        case "SET_SELECTED_FOLDER":
            return { ...state, selectedFolder: action.payload };
        case "SET_PROCESSED_VIDEOS":
            return { ...state, processedVideos: action.payload };
        case "SET_LOADING":
            return { ...state, loading: action.payload };
        case "SET_ERROR":
            return { ...state, error: action.payload };
        case "ADD_LIBRARY_FOLDER":
            return {
                ...state,
                libraryFolders: [...state.libraryFolders, action.payload].filter((v, i, a) => a.indexOf(v) === i),
            };
        case "REMOVE_LIBRARY_FOLDER":
            return {
                ...state,
                libraryFolders: state.libraryFolders.filter((folder) => folder !== action.payload),
            };
        case "UPDATE_PROCESSED_VIDEO":
            return {
                ...state,
                processedVideos: state.processedVideos.map((video) =>
                    video.file_path === action.payload.file_path ? action.payload : video
                ),
                recentVideos: state.recentVideos.map((video) =>
                    video.file_path === action.payload.file_path ? action.payload : video
                ),
                videosInProgress: state.videosInProgress.map((video) =>
                    video.file_path === action.payload.file_path ? action.payload : video
                ),
                suggestedVideos: state.suggestedVideos.map((video) =>
                    video.file_path === action.payload.file_path ? action.payload : video
                ),
            };
        case "CLEAR_ERROR":
            return { ...state, error: null };
        default:
            return state;
    }
}

interface VideoLibraryContextType {
    state: VideoLibraryState;
    dispatch: React.Dispatch<VideoLibraryAction>;
    actions: {
        loadHomePageData: () => Promise<void>;
        loadLibraryFolders: () => Promise<void>;
        initializeLibrary: () => Promise<void>;
        addLibraryFolder: (folder: string) => void;
        removeLibraryFolder: (folder: string) => void;
        selectFolder: (folder: string | null) => void;
        updateVideo: (video: ProcessedVideo) => void;
        clearError: () => void;
        setRecentVideos: (videos: ProcessedVideo[]) => void;
        setVideosInProgress: (videos: ProcessedVideo[]) => void;
        setSuggestedVideos: (videos: ProcessedVideo[]) => void;
        setProcessedVideos: (videos: ProcessedVideo[]) => void;
        setLibraryFoldersWithPreviews: (folders: { folder: string; videos: ProcessedVideo[] }[]) => void;
        setLoading: (loading: boolean) => void;
        setError: (error: string | null) => void;
        setProcessedVideosReact: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
        setRecentVideosReact: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
        setVideosInProgressReact: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
        setSuggestedVideosReact: React.Dispatch<React.SetStateAction<ProcessedVideo[]>>;
    };
}

const VideoLibraryContext = createContext<VideoLibraryContextType | undefined>(undefined);

interface VideoLibraryProviderProps {
    children: ReactNode;
}

export function VideoLibraryProvider({ children }: VideoLibraryProviderProps) {
    const [state, dispatch] = useReducer(videoLibraryReducer, initialState);

    const loadHomePageData = async () => {
        try {
            dispatch({ type: "SET_LOADING", payload: true });
            dispatch({ type: "CLEAR_ERROR" });

            const [recent, inProgress, suggestions, foldersWithPreviews] = await Promise.all([
                getRecentlyWatchedVideos(8),
                getVideosInProgress(8),
                getUnwatchedVideos(5),
                getLibraryFoldersWithPreviews(),
            ]);

            dispatch({ type: "SET_RECENT_VIDEOS", payload: recent });
            dispatch({ type: "SET_VIDEOS_IN_PROGRESS", payload: inProgress });
            dispatch({ type: "SET_SUGGESTED_VIDEOS", payload: suggestions });
            dispatch({ type: "SET_LIBRARY_FOLDERS_WITH_PREVIEWS", payload: foldersWithPreviews });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to load home page data";
            dispatch({ type: "SET_ERROR", payload: errorMessage });
            console.error("Error loading home page data:", error);
        } finally {
            dispatch({ type: "SET_LOADING", payload: false });
        }
    };

    const loadLibraryFolders = async () => {
        try {
            const folders = await getLibraryFolders();
            dispatch({ type: "SET_LIBRARY_FOLDERS", payload: folders });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to load library folders";
            dispatch({ type: "SET_ERROR", payload: errorMessage });
            console.error("Error loading library folders:", error);
        }
    };

    const initializeLibrary = async () => {
        try {
            dispatch({ type: "SET_LOADING", payload: true });
            dispatch({ type: "CLEAR_ERROR" });

            await initDatabase();
            await loadLibraryFolders();
            await loadHomePageData();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to initialize library";
            dispatch({ type: "SET_ERROR", payload: errorMessage });
            console.error("Error initializing library:", error);
        } finally {
            dispatch({ type: "SET_LOADING", payload: false });
        }
    };

    const addLibraryFolder = (folder: string) => {
        dispatch({ type: "ADD_LIBRARY_FOLDER", payload: folder });
    };

    const removeLibraryFolder = (folder: string) => {
        dispatch({ type: "REMOVE_LIBRARY_FOLDER", payload: folder });
    };

    const selectFolder = (folder: string | null) => {
        dispatch({ type: "SET_SELECTED_FOLDER", payload: folder });
    };

    const updateVideo = (video: ProcessedVideo) => {
        dispatch({ type: "UPDATE_PROCESSED_VIDEO", payload: video });
    };

    const clearError = () => {
        dispatch({ type: "CLEAR_ERROR" });
    };

    const actions = {
        loadHomePageData,
        loadLibraryFolders,
        initializeLibrary,
        addLibraryFolder,
        removeLibraryFolder,
        selectFolder,
        updateVideo,
        clearError,
        setRecentVideos: (videos: ProcessedVideo[]) => {
            dispatch({ type: "SET_RECENT_VIDEOS", payload: videos });
        },
        setVideosInProgress: (videos: ProcessedVideo[]) => {
            dispatch({ type: "SET_VIDEOS_IN_PROGRESS", payload: videos });
        },
        setSuggestedVideos: (videos: ProcessedVideo[]) => {
            dispatch({ type: "SET_SUGGESTED_VIDEOS", payload: videos });
        },
        setProcessedVideos: (videos: ProcessedVideo[]) => {
            dispatch({ type: "SET_PROCESSED_VIDEOS", payload: videos });
        },
        setLibraryFoldersWithPreviews: (folders: { folder: string; videos: ProcessedVideo[] }[]) => {
            dispatch({ type: "SET_LIBRARY_FOLDERS_WITH_PREVIEWS", payload: folders });
        },
        setLoading: (loading: boolean) => {
            dispatch({ type: "SET_LOADING", payload: loading });
        },
        setError: (error: string | null) => {
            dispatch({ type: "SET_ERROR", payload: error });
        },
        setProcessedVideosReact: ((value: React.SetStateAction<ProcessedVideo[]>) => {
            if (typeof value === "function") {
                dispatch({ type: "SET_PROCESSED_VIDEOS", payload: value(state.processedVideos) });
            } else {
                dispatch({ type: "SET_PROCESSED_VIDEOS", payload: value });
            }
        }) as React.Dispatch<React.SetStateAction<ProcessedVideo[]>>,
        setRecentVideosReact: ((value: React.SetStateAction<ProcessedVideo[]>) => {
            if (typeof value === "function") {
                dispatch({ type: "SET_RECENT_VIDEOS", payload: value(state.recentVideos) });
            } else {
                dispatch({ type: "SET_RECENT_VIDEOS", payload: value });
            }
        }) as React.Dispatch<React.SetStateAction<ProcessedVideo[]>>,
        setVideosInProgressReact: ((value: React.SetStateAction<ProcessedVideo[]>) => {
            if (typeof value === "function") {
                dispatch({ type: "SET_VIDEOS_IN_PROGRESS", payload: value(state.videosInProgress) });
            } else {
                dispatch({ type: "SET_VIDEOS_IN_PROGRESS", payload: value });
            }
        }) as React.Dispatch<React.SetStateAction<ProcessedVideo[]>>,
        setSuggestedVideosReact: ((value: React.SetStateAction<ProcessedVideo[]>) => {
            if (typeof value === "function") {
                dispatch({ type: "SET_SUGGESTED_VIDEOS", payload: value(state.suggestedVideos) });
            } else {
                dispatch({ type: "SET_SUGGESTED_VIDEOS", payload: value });
            }
        }) as React.Dispatch<React.SetStateAction<ProcessedVideo[]>>,
    };

    return <VideoLibraryContext.Provider value={{ state, dispatch, actions }}>{children}</VideoLibraryContext.Provider>;
}

export function useVideoLibrary() {
    const context = useContext(VideoLibraryContext);
    if (context === undefined) {
        throw new Error("useVideoLibrary deve ser usado dentro de um VideoLibraryProvider");
    }
    return context;
}
