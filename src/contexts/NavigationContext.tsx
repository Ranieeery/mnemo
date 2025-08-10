import { createContext, useContext, ReactNode, useReducer } from 'react';

// Directory entry representation
export interface DirEntry {
    name: string;
    path: string;
    is_dir: boolean;
    is_video: boolean;
}

// Navigation state types
export interface NavigationState {
    history: string[];
    currentIndex: number;
    currentPath: string;
    showHomePage: boolean;
    directoryContents: DirEntry[];
}

export type NavigationAction =
    | { type: 'NAVIGATE_TO'; payload: string }
    | { type: 'GO_BACK' }
    | { type: 'GO_FORWARD' }
    | { type: 'GO_TO_HOME' }
    | { type: 'SET_CURRENT_PATH'; payload: string }
    | { type: 'SET_DIRECTORY_CONTENTS'; payload: DirEntry[] };

// Initial state (home seeded as first history entry)
const initialState: NavigationState = {
    history: [''],
    currentIndex: 0,
    currentPath: '',
    showHomePage: true,
    directoryContents: [],
};

// Reducer managing navigation history stack and current path
function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
    switch (action.type) {
        case 'NAVIGATE_TO': {
            if (action.payload === '') {
                return navigationReducer(state, { type: 'GO_TO_HOME' });
            }
            const newHistory = [...state.history.slice(0, state.currentIndex + 1), action.payload];
            return {
                ...state,
                history: newHistory,
                currentIndex: newHistory.length - 1,
                currentPath: action.payload,
                showHomePage: false,
            };
        }
        case 'GO_BACK': {
            if (state.currentIndex > 0) {
                const newIndex = state.currentIndex - 1;
                const newPath = state.history[newIndex];
                return {
                    ...state,
                    currentIndex: newIndex,
                    currentPath: newPath,
                    showHomePage: newPath === '',
                };
            }
            return state;
        }
        case 'GO_FORWARD': {
            if (state.currentIndex < state.history.length - 1) {
                const newIndex = state.currentIndex + 1;
                const newPath = state.history[newIndex];
                return {
                    ...state,
                    currentIndex: newIndex,
                    currentPath: newPath,
                    showHomePage: newPath === '',
                };
            }
            return state;
        }
        case 'GO_TO_HOME': {
            const alreadyHome = state.currentPath === '' && state.showHomePage;
            if (alreadyHome) return state;
            const newHistory = [...state.history.slice(0, state.currentIndex + 1), ''];
            return {
                ...state,
                history: newHistory,
                currentIndex: newHistory.length - 1,
                currentPath: '',
                showHomePage: true,
                directoryContents: [],
            };
        }
        case 'SET_CURRENT_PATH': {
            return {
                ...state,
                currentPath: action.payload,
                showHomePage: action.payload === '',
            };
        }
        case 'SET_DIRECTORY_CONTENTS': {
            return {
                ...state,
                directoryContents: action.payload,
            };
        }
        default:
            return state;
    }
}

// Context
interface NavigationContextType {
    state: NavigationState;
    dispatch: React.Dispatch<NavigationAction>;
    actions: {
        navigateTo: (path: string) => void;
        goBack: () => void;
        goForward: () => void;
        goToHome: () => void;
        setCurrentPath: (path: string) => void;
        setDirectoryContents: (contents: DirEntry[]) => void;
    };
    computed: {
        canGoBack: boolean;
        canGoForward: boolean;
    isHome: boolean;
    };
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Provider
interface NavigationProviderProps {
    children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
    const [state, dispatch] = useReducer(navigationReducer, initialState);

    // Action helpers
    const navigateTo = (path: string) => {
        dispatch({ type: 'NAVIGATE_TO', payload: path });
    };

    const goBack = () => {
        dispatch({ type: 'GO_BACK' });
    };

    const goForward = () => {
        dispatch({ type: 'GO_FORWARD' });
    };

    const goToHome = () => {
        dispatch({ type: 'GO_TO_HOME' });
    };

    const setCurrentPath = (path: string) => {
        dispatch({ type: 'SET_CURRENT_PATH', payload: path });
    };

    const setDirectoryContents = (contents: DirEntry[]) => {
        dispatch({ type: 'SET_DIRECTORY_CONTENTS', payload: contents });
    };

    // Computed flags
    const canGoBack = state.currentIndex > 0;
    const canGoForward = state.currentIndex < state.history.length - 1;

    const actions = {
        navigateTo,
        goBack,
        goForward,
        goToHome,
        setCurrentPath,
        setDirectoryContents,
    };

    const computed = {
        canGoBack,
        canGoForward,
        isHome: state.showHomePage && state.currentPath === '',
    };

    return (
        <NavigationContext.Provider value={{ state, dispatch, actions, computed }}>
            {children}
        </NavigationContext.Provider>
    );
}

// Hook
export function useNavigation() {
    const context = useContext(NavigationContext);
    if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
}
