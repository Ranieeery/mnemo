import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Erro capturado pelo boundary:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: undefined });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                    <div className="max-w-md w-full mx-4">
                        <div className="bg-gray-800 rounded-lg p-6 border border-red-500/20">
                            <div className="flex items-center mb-4">
                                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mr-4">
                                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-red-400">Algo deu errado</h2>
                                    <p className="text-gray-400 text-sm">Ocorreu um erro inesperado</p>
                                </div>
                            </div>
                            
                            {this.state.error && (
                                <div className="mb-4 p-3 bg-gray-700/50 rounded border border-gray-600">
                                    <p className="text-sm text-gray-300 font-mono">
                                        {this.state.error.message}
                                    </p>
                                </div>
                            )}
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={this.handleRetry}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                                >
                                    Tentar Novamente
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                                >
                                    Recarregar App
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
