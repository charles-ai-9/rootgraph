export interface VariantTab {
  root: string;
  /** 展示用（保留教材原写法，如 (s)pend）；缺省用 root */
  display?: string;
  count: number;
}

export const OVERVIEW_PANEL = '__overview__';

interface FamilyVariantNavProps {
  tabs: VariantTab[];
  active: string;
  onChange: (panel: string) => void;
}

/** 词根族内的变体导航（cern / crim / cert …） */
export function FamilyVariantNav({ tabs, active, onChange }: FamilyVariantNavProps) {
  if (tabs.length <= 1) return null;

  return (
    <nav className="family-variant-nav" aria-label="词根变体">
      <button
        type="button"
        className={`family-variant-tab ${active === OVERVIEW_PANEL ? 'active' : ''}`}
        onClick={() => onChange(OVERVIEW_PANEL)}
      >
        概览
      </button>
      {tabs.map((tab) => (
        <button
          key={tab.root}
          type="button"
          className={`family-variant-tab ${active === tab.root ? 'active' : ''}`}
          onClick={() => onChange(tab.root)}
        >
          {tab.display ?? tab.root}
          <span className="family-variant-count">{tab.count}</span>
        </button>
      ))}
    </nav>
  );
}

interface VariantStepperProps {
  tabs: VariantTab[];
  active: string;
  onChange: (panel: string) => void;
}

/** 变体底部：上一组 / 下一组 */
export function VariantStepper({ tabs, active, onChange }: VariantStepperProps) {
  if (tabs.length <= 1 || active === OVERVIEW_PANEL) return null;

  const index = tabs.findIndex((t) => t.root === active);
  if (index < 0) return null;

  const prev = index > 0 ? tabs[index - 1] : null;
  const next = index < tabs.length - 1 ? tabs[index + 1] : null;

  return (
    <footer className="variant-stepper">
      <button
        type="button"
        className="variant-stepper-btn"
        disabled={!prev}
        onClick={() => prev && onChange(prev.root)}
      >
        {prev ? `← ${prev.display ?? prev.root}` : '—'}
      </button>
      <span className="variant-stepper-pos">
        {index + 1}
        <span className="variant-stepper-total"> / {tabs.length}</span>
      </span>
      <button
        type="button"
        className="variant-stepper-btn next"
        disabled={!next}
        onClick={() => next && onChange(next.root)}
      >
        {next ? `${next.display ?? next.root} →` : '—'}
      </button>
    </footer>
  );
}
