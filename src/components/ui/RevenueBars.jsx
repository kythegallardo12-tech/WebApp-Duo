import { useCurrency } from '../../hooks/useCurrency';

/**
 * Monthly revenue as plain bars. The latest month is drawn in the accent colour; the table
 * of values below the bars is what screen readers get.
 */
const RevenueBars = ({ data, height = 'h-48' }) => {
  const { money, compactMoney } = useCurrency();
  const max = Math.max(1, ...data.map((d) => d.revenue));

  return (
    <figure>
      <div className={`flex items-end gap-2 sm:gap-3 ${height}`} aria-hidden="true">
        {data.map((d, i) => {
          const pct = d.revenue > 0 ? Math.max(3, Math.round((d.revenue / max) * 100)) : 0;
          const latest = i === data.length - 1;
          return (
            <div key={`${d.year}-${d.month}`} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5">
              <span className={`text-[0.6875rem] tabular truncate max-w-full ${latest ? 'text-ink font-semibold' : 'text-ink-3'}`}>{compactMoney(d.revenue)}</span>
              <div className="w-full max-w-14 flex-1 flex items-end rounded-md bg-white/[0.025]">
                <div className={`w-full rounded-md ${latest ? 'bg-accent' : 'bg-[#2b3a5c]'}`} style={{ height: `${pct}%` }} />
              </div>
              <span className={`text-xs ${latest ? 'text-ink font-medium' : 'text-ink-3'}`}>{d.month}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Revenue by month</caption>
        <tbody>
          {data.map((d) => (
            <tr key={`${d.year}-${d.month}`}>
              <th scope="row">
                {d.month} {d.year}
              </th>
              <td>{money(d.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

export default RevenueBars;
