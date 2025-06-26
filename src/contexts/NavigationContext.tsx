import { createContext, useContext, ReactNode, useReducer } from 'react';

// Types
export interface NavigationState {
    history: string[];
    currentIndex: number;
    currentPath: string;
    showHomePage: boolean;
}

export type NavigationAction =
    | { type: 'NAVIGATE_TO'; payload: string }
    | { type: 'GO_BACK' }
    | { type: 'GO_FORWARD' }
    | { type: 'GO_TO_HOME' }
    | { type: 'SET_CURRENT_PATH'; payload: string };

// Initial state
const initialState: NavigationState = {
    history: [],
    currentIndex: -1,
    currentPath: '',
    showHomePage: true,
};

// Reducer
function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
    switch (action.type) {
        case 'NAVIGATE_TO': {
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
                return {
                    ...state,
                    currentIndex: newIndex,
                    currentPath: state.history[newIndex],
                    showHomePage: false,
                };
            }
            return state;
        }
        case 'GO_FORWARD': {
            if (state.currentIndex < state.history.length - 1) {
                const newIndex = state.currentIndex + 1;
                return {
                    ...state,
                    currentIndex: newIndex,
                    currentPath: state.history[newIndex],
                    showHomePage: false,
                };
            }
            return state;
        }
        case 'GO_TO_HOME': {
            return {
                ...state,
                showHomePage: true,
                currentPath: '',
            };
        }
        case 'SET_CURRENT_PATH': {
            return {
                ...state,
                currentPath: action.payload,
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
    };
    computed: {
        canGoBack: boolean;
        canGoForward: boolean;
    };
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Provider
interface NavigationProviderProps {
    children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
    const [state, dispatch] = useReducer(navigationReducer, initialState);

    // Actions
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

    // Computed values
    const canGoBack = state.currentIndex > 0;
    const canGoForward = state.currentIndex < state.history.length - 1;

    const actions = {
        navigateTo,
        goBack,
        goForward,
        goToHome,
        setCurrentPath,
    };

    const computed = {
        canGoBack,
        canGoForward,
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
