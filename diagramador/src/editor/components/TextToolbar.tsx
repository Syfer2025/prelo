import type { CharacterStyle, ParagraphStyle } from '../../model/types';
import ZoomControls from './ZoomControls';

type Alignment = ParagraphStyle['alignment'];

interface StylePatch {
  paragraph?: Partial<ParagraphStyle>;
  character?: Partial<CharacterStyle>;
}

interface TextToolbarProps {
  projectName: string;
  style: ParagraphStyle;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: 'idle' | 'saved';
  exportStatus: 'idle' | 'generating' | 'ready' | 'error';
  zoom: number;
  onStyleChange: (patch: StylePatch) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportPdf: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

const FONT_FAMILIES = ['Crimson Text', 'Georgia', 'Times New Roman', 'Helvetica'];
const ALIGNMENTS: { value: Alignment; label: string; glyph: string }[] = [
  { value: 'left', label: 'Esquerda', glyph: '⯇' },
  { value: 'center', label: 'Centro', glyph: '≡' },
  { value: 'right', label: 'Direita', glyph: '⯈' },
  { value: 'justify', label: 'Justificado', glyph: '☰' },
];

export default function TextToolbar({
  projectName,
  style,
  canUndo,
  canRedo,
  saveStatus,
  exportStatus,
  zoom,
  onStyleChange,
  onSave,
  onUndo,
  onRedo,
  onExportPdf,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: TextToolbarProps) {
  return (
    <header className="editor-toolbar">
      <div className="toolbar-group toolbar-project">
        <span className="toolbar-project-name" title="Nome do projeto">
          {projectName}
        </span>
        <button type="button" className="tb-btn" onClick={onSave}>
          Salvar
        </button>
        <span className={`tb-status ${saveStatus}`}>{saveStatus === 'saved' ? 'Salvo' : ''}</span>
      </div>

      <div className="toolbar-group">
        <button type="button" className="tb-btn" onClick={onUndo} disabled={!canUndo} title="Desfazer">
          ↩ Desfazer
        </button>
        <button type="button" className="tb-btn" onClick={onRedo} disabled={!canRedo} title="Refazer">
          Refazer ↪
        </button>
      </div>

      <div className="toolbar-group">
        <label className="tb-field">
          <span>Fonte</span>
          <select
            value={style.characterStyle.fontFamily}
            onChange={(e) => onStyleChange({ character: { fontFamily: e.target.value } })}
          >
            {FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </label>
        <label className="tb-field tb-narrow">
          <span>Corpo</span>
          <input
            type="number"
            min={6}
            max={72}
            value={style.characterStyle.fontSize}
            onChange={(e) => onStyleChange({ character: { fontSize: Number(e.target.value) } })}
          />
        </label>
        <label className="tb-field tb-narrow">
          <span>Entrelinha</span>
          <input
            type="number"
            min={1}
            max={3}
            step={0.1}
            value={style.lineHeight}
            onChange={(e) => onStyleChange({ paragraph: { lineHeight: Number(e.target.value) } })}
          />
        </label>
      </div>

      <div className="toolbar-group toolbar-align">
        {ALIGNMENTS.map((a) => (
          <button
            key={a.value}
            type="button"
            className={`tb-btn tb-icon ${style.alignment === a.value ? 'active' : ''}`}
            title={a.label}
            onClick={() => onStyleChange({ paragraph: { alignment: a.value } })}
          >
            {a.glyph}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <label className="tb-field tb-narrow">
          <span>Recuo</span>
          <input
            type="number"
            min={0}
            max={96}
            value={style.indent}
            onChange={(e) => onStyleChange({ paragraph: { indent: Number(e.target.value) } })}
          />
        </label>
        <label className="tb-field tb-narrow">
          <span>Antes</span>
          <input
            type="number"
            min={0}
            max={64}
            value={style.spaceBefore}
            onChange={(e) => onStyleChange({ paragraph: { spaceBefore: Number(e.target.value) } })}
          />
        </label>
        <label className="tb-field tb-narrow">
          <span>Depois</span>
          <input
            type="number"
            min={0}
            max={64}
            value={style.spaceAfter}
            onChange={(e) => onStyleChange({ paragraph: { spaceAfter: Number(e.target.value) } })}
          />
        </label>
      </div>

      <div className="toolbar-group toolbar-right">
        <ZoomControls
          zoom={zoom}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onReset={onZoomReset}
        />
        <button
          type="button"
          className="tb-btn tb-export"
          onClick={onExportPdf}
          disabled={exportStatus === 'generating'}
        >
          {exportStatus === 'generating' ? 'Gerando…' : 'Exportar PDF'}
        </button>
        {exportStatus === 'error' && <span className="tb-status error">Erro</span>}
        {exportStatus === 'ready' && <span className="tb-status saved">PDF pronto</span>}
      </div>
    </header>
  );
}
