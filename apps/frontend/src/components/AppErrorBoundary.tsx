import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('Error de render no controlado', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-cefide-bg p-6 text-cefide-text">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Ocurrió un error inesperado</h1>
          <p className="text-cefide-muted">Podés intentar recargar la pantalla. Si el problema continúa, contactá al administrador.</p>
          <Button onClick={() => window.location.reload()}>Recargar</Button>
        </div>
      </main>
    );
  }
}
