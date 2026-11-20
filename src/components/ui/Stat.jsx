import { TrendingUp, TrendingDown } from 'lucide-react';

const tones = {
  default: 'text-ink',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/** A single figure with a label, used in the summary rows at the top of each screen. */
export const Stat = ({ label, value, meta, tone = 'default', valueTestId, children }) => (
  <div className="card p-4 sm:p-5 min-w-0">
    <p className="stat-label truncate">{label}</p>
    <p className={`stat-value truncate ${tones[tone] || tones.default}`} data-testid={valueTestId}>
      {value}
    </p>
    {meta && <div className="stat-meta">{meta}</div>}
    {children}
  </div>
);

/** "+12% vs previous 30 days", coloured by direction. */
export const Growth = ({ value, label = 'vs previous 30 days' }) => {
  const n = Number(value) || 0;
  const up = n >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-success' : 'text-danger'}`}>
        <Icon size={13} aria-hidden="true" />
        {up ? '+' : ''}
        {n}%
      </span>
      <span>{label}</span>
    </span>
  );
};

export default Stat;
