import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface State {
  hasError: boolean
}

// Sem isso, qualquer erro de renderização desmonta o app inteiro (tela vazia).
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro na tela', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card error-screen">
          <h1>Algo deu errado nesta tela</h1>
          <p className="muted">
            Seus dados estão seguros. Recarregue a página; se o problema continuar, volte para a
            loja.
          </p>
          <div className="error-actions">
            <button type="button" className="button" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <a href="/" className="link-button">
              Voltar para a loja
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
