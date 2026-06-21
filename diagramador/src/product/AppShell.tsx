/**
 * AppShell — raiz do PRODUTO. Abre no editor real em branco por padrão e permite
 * alternar para o laboratório do motor (demo histórico), que segue preservado.
 *
 * Telas futuras previstas (ainda stubs / não roteadas): Home, login/cadastro,
 * ProjectDashboard, NewBookWizard, galeria de templates, medidas personalizadas,
 * preflight/exportação detalhada.
 */
import { useState } from 'react';
import EditorShell from './EditorShell';
import MotorLab from '../lab/MotorLab';
import './product.css';

type View = 'editor' | 'lab';

export default function AppShell() {
  const [view, setView] = useState<View>('editor');

  return (
    <div className="app-shell">
      <nav className="app-shell-nav">
        <span className="app-shell-brand">Prelo</span>
        <div className="app-shell-tabs">
          <button
            type="button"
            className={view === 'editor' ? 'active' : ''}
            onClick={() => setView('editor')}
          >
            Editor
          </button>
          <button
            type="button"
            className={view === 'lab' ? 'active' : ''}
            onClick={() => setView('lab')}
          >
            Laboratório do motor
          </button>
        </div>
      </nav>
      <div className="app-shell-view">
        {view === 'editor' ? <EditorShell /> : <MotorLab />}
      </div>
    </div>
  );
}
