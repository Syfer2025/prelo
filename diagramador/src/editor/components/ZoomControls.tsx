interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export default function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" aria-label="Zoom">
      <button type="button" className="zoom-btn" onClick={onZoomOut} title="Diminuir zoom">
        −
      </button>
      <button type="button" className="zoom-value" onClick={onReset} title="Restaurar zoom (100%)">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="zoom-btn" onClick={onZoomIn} title="Aumentar zoom">
        +
      </button>
    </div>
  );
}
