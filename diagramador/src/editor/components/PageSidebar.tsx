interface PageSidebarProps {
  pageCount: number;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAddPage: () => void;
}

export default function PageSidebar({
  pageCount,
  activeIndex,
  onSelect,
  onAddPage,
}: PageSidebarProps) {
  return (
    <aside className="page-sidebar" aria-label="Páginas">
      <div className="page-sidebar-header">Páginas</div>
      <div className="page-sidebar-list">
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`page-thumb ${index === activeIndex ? 'active' : ''}`}
            onClick={() => onSelect(index)}
          >
            <span className="page-thumb-mini" aria-hidden="true" />
            <span className="page-thumb-label">Página {index + 1}</span>
          </button>
        ))}
      </div>
      <button type="button" className="add-page-btn" onClick={onAddPage}>
        + Página
      </button>
    </aside>
  );
}
