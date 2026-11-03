import { formatMoney } from "@/lib/money";
import { cn, scrollable } from "@/components/ui/primitives";
import type { Table } from "@/server/modules/reporting";

/** Tabla de reporte en pantalla: la misma estructura que se exporta a XLSX, CSV y PDF. */
export function ReportTable({ table, currency, locale, monthLabels }: { table: Table; currency: string; locale: string; monthLabels?: Record<string, string> }) {
  const render = (value: string | bigint | number | null, kind: Table["columns"][number]["kind"]) => {
    if (value === null) return "";
    if (kind === "money" && typeof value === "bigint") return formatMoney(value, currency, locale);
    if (kind === "percent" && typeof value === "number") return `${value.toLocaleString(locale)} %`;
    if (typeof value === "string" && monthLabels?.[value]) return monthLabels[value];
    return String(value);
  };
  const isSection = (row: Array<string | bigint | number | null>) => typeof row[0] === "string" && row.slice(1).every((v) => v === null) && row[0] === row[0].toUpperCase();
  return (
    <div className="overflow-x-auto" {...scrollable(table.title)}>
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <caption className="sr-only">{table.title}</caption>
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
            {table.columns.map((c) => (
              <th key={c.header} scope="col" className={cn("py-2 pr-4", c.kind !== "text" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {table.rows.map((row, i) =>
            isSection(row) ? (
              <tr key={i}>
                <th colSpan={table.columns.length} scope="rowgroup" className="pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {String(row[0])}
                </th>
              </tr>
            ) : (
              <tr key={i} className={cn(typeof row[0] === "string" && !row[0].startsWith("  ") && table.title === "Estado de resultados" && "font-semibold")}>
                {row.map((v, j) => (
                  <td key={j} className={cn("py-2 pr-4", table.columns[j]!.kind !== "text" && "text-right tabular", typeof v === "bigint" && v < 0n && "text-text-2")}>
                    {render(v, table.columns[j]!.kind)}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
        {table.footer ? (
          <tfoot>
            {table.footer.map((row, i) => (
              <tr key={i} className="border-t-2 border-border-strong font-bold">
                {row.map((v, j) => (
                  <td key={j} className={cn("py-2.5 pr-4", table.columns[j]!.kind !== "text" && "text-right tabular")}>
                    {render(v, table.columns[j]!.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
