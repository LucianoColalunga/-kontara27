import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, type Tx, withTenant } from "@/server/platform/db";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";

export const periodInput = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  sectorId: z.uuid().optional(),
});
export type PeriodInput = z.infer<typeof periodInput>;

export interface KindTotals {
  income: bigint;
  refundOut: bigint;
  expense: bigint;
  refundIn: bigint;
  investment: bigint;
  contribution: bigint;
  withdrawal: bigint;
  adjustmentIn: bigint;
  adjustmentOut: bigint;
  movementCount: number;
}

export interface Summary extends KindTotals {
  /** Ingresos netos de devoluciones emitidas. */
  netIncome: bigint;
  /** Gastos netos de devoluciones recibidas. */
  netExpense: bigint;
  /** Resultado del período (estado de resultados). */
  result: bigint;
  cashIn: bigint;
  cashOut: bigint;
  netCashFlow: bigint;
  /** Margen sobre ingresos netos, en porcentaje (null si no hubo ingresos). */
  margin: number | null;
}

export interface MonthPoint extends Summary {
  month: string;
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string | null;
  totalMinor: bigint;
  count: number;
  share: number;
}

const KIND_COLUMNS = sql`
  coalesce(sum(amount_minor) filter (where kind = 'income'), 0)::text as income,
  coalesce(sum(amount_minor) filter (where kind = 'refund_out'), 0)::text as refund_out,
  coalesce(sum(amount_minor) filter (where kind = 'expense'), 0)::text as expense,
  coalesce(sum(amount_minor) filter (where kind = 'refund_in'), 0)::text as refund_in,
  coalesce(sum(amount_minor) filter (where kind = 'investment'), 0)::text as investment,
  coalesce(sum(amount_minor) filter (where kind = 'contribution'), 0)::text as contribution,
  coalesce(sum(amount_minor) filter (where kind = 'withdrawal'), 0)::text as withdrawal,
  coalesce(sum(amount_minor) filter (where kind = 'adjustment_in'), 0)::text as adjustment_in,
  coalesce(sum(amount_minor) filter (where kind = 'adjustment_out'), 0)::text as adjustment_out,
  (count(*) filter (where kind <> 'transfer'))::int as movement_count`;

type KindRow = Record<"income" | "refund_out" | "expense" | "refund_in" | "investment" | "contribution" | "withdrawal" | "adjustment_in" | "adjustment_out", string> & { movement_count: number };

/** Cálculo puro sobre los totales por naturaleza: es lo que verifican las pruebas de cálculos financieros. */
export function summarize(t: KindTotals): Summary {
  const netIncome = t.income - t.refundOut;
  const netExpense = t.expense - t.refundIn;
  const result = netIncome - netExpense;
  const cashIn = t.income + t.refundIn + t.contribution + t.adjustmentIn;
  const cashOut = t.expense + t.refundOut + t.investment + t.withdrawal + t.adjustmentOut;
  const margin = netIncome > 0n ? Number((result * 10000n) / netIncome) / 100 : null;
  return { ...t, netIncome, netExpense, result, cashIn, cashOut, netCashFlow: cashIn - cashOut, margin };
}

function toTotals(row: KindRow | undefined): KindTotals {
  const n = (v: string | undefined) => BigInt(v ?? "0");
  return {
    income: n(row?.income),
    refundOut: n(row?.refund_out),
    expense: n(row?.expense),
    refundIn: n(row?.refund_in),
    investment: n(row?.investment),
    contribution: n(row?.contribution),
    withdrawal: n(row?.withdrawal),
    adjustmentIn: n(row?.adjustment_in),
    adjustmentOut: n(row?.adjustment_out),
    movementCount: row?.movement_count ?? 0,
  };
}

function baseWhere(p: PeriodInput) {
  return sql`deleted_at is null and status = 'completed' and currency = ${p.currency}
             and occurred_on between ${p.from} and ${p.to}
             ${p.sectorId ? sql`and sector_id = ${p.sectorId}` : sql``}`;
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number) as [number, number];
  const [ty, tm] = to.slice(0, 7).split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 240) break;
  }
  return out;
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Período anterior de igual duración (para comparar). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  const prevEnd = new Date(start - 86_400_000);
  const prevStart = new Date(start - days * 86_400_000);
  return { from: prevStart.toISOString().slice(0, 10), to: prevEnd.toISOString().slice(0, 10) };
}

export class ReportingService {
  constructor(private readonly db: Database) {}

  private run<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>) {
    authorize(ctx, "reports.view");
    return withTenant(this.db, tenantScope(ctx), fn);
  }

  async currencies(ctx: TenantContext): Promise<string[]> {
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx.execute<{ currency: string }>(sql`
        select currency from movements where deleted_at is null
        union select currency from accounts where is_archived = false
        union select ${ctx.organization.currency}`);
      const list = result.rows.map((r) => r.currency);
      return [ctx.organization.currency, ...list.filter((c) => c !== ctx.organization.currency).sort()];
    });
  }

  async summary(ctx: TenantContext, raw: PeriodInput): Promise<Summary> {
    const p = periodInput.parse(raw);
    return this.run(ctx, async (tx) => {
      const result = await tx.execute<KindRow>(sql`select ${KIND_COLUMNS} from movements where ${baseWhere(p)}`);
      return summarize(toTotals(result.rows[0]));
    });
  }

  async monthly(ctx: TenantContext, raw: PeriodInput): Promise<MonthPoint[]> {
    const p = periodInput.parse(raw);
    return this.run(ctx, async (tx) => {
      const result = await tx.execute<KindRow & { month: string }>(sql`
        select to_char(date_trunc('month', occurred_on), 'YYYY-MM') as month, ${KIND_COLUMNS}
        from movements where ${baseWhere(p)} group by 1 order by 1`);
      const byMonth = new Map(result.rows.map((r) => [r.month, r]));
      return monthsBetween(p.from, p.to).map((month) => ({ month, ...summarize(toTotals(byMonth.get(month))) }));
    });
  }

  /** Desglose por categoría. Ingresos: ingresos − devoluciones emitidas. Gastos: gastos − devoluciones recibidas. */
  async byCategory(ctx: TenantContext, raw: PeriodInput, side: "income" | "expense"): Promise<CategoryTotal[]> {
    const p = periodInput.parse(raw);
    const [plus, minus] = side === "income" ? ["income", "refund_out"] : ["expense", "refund_in"];
    return this.run(ctx, async (tx) => {
      const result = await tx.execute<{ category_id: string | null; name: string | null; color: string | null; total: string; n: number }>(sql`
        select m.category_id, c.name, c.color,
               sum(case when m.kind = ${plus} then m.amount_minor else -m.amount_minor end)::text as total,
               count(*)::int as n
        from movements m left join categories c on c.id = m.category_id
        where m.kind in (${plus}, ${minus}) and ${baseWhere(p)}
        group by m.category_id, c.name, c.color
        order by sum(case when m.kind = ${plus} then m.amount_minor else -m.amount_minor end) desc`);
      const rows = result.rows.map((r) => ({ categoryId: r.category_id, name: r.name ?? "Sin categoría", color: r.color, totalMinor: BigInt(r.total), count: r.n }));
      const total = rows.reduce((acc, r) => acc + (r.totalMinor > 0n ? r.totalMinor : 0n), 0n);
      return rows.map((r) => ({ ...r, share: total > 0n && r.totalMinor > 0n ? Number((r.totalMinor * 10000n) / total) / 100 : 0 }));
    });
  }

  /**
   * Alertas de gasto elevado: categorías cuyo gasto del período supera en más de 50 % el promedio
   * mensual de los tres meses anteriores. Explicable y sin falsos positivos por categorías nuevas.
   */
  async expenseSpikes(ctx: TenantContext, raw: PeriodInput): Promise<Array<{ categoryId: string | null; name: string; currentMinor: bigint; averageMinor: bigint; increasePct: number }>> {
    const p = periodInput.parse(raw);
    const monthStart = `${p.to.slice(0, 7)}-01`;
    return this.run(ctx, async (tx) => {
      const result = await tx.execute<{ category_id: string | null; name: string | null; current_total: string; avg_total: string }>(sql`
        with scoped as (
          select category_id, occurred_on,
                 case when kind = 'expense' then amount_minor else -amount_minor end as amount
          from movements
          where deleted_at is null and status = 'completed' and currency = ${p.currency} and kind in ('expense', 'refund_in')
            and occurred_on >= (${monthStart}::date - interval '3 months') and occurred_on <= ${p.to}
        ),
        cur as (select category_id, sum(amount) as total from scoped where occurred_on >= ${monthStart}::date group by category_id),
        prev as (select category_id, sum(amount) / 3 as avg from scoped where occurred_on < ${monthStart}::date group by category_id)
        select cur.category_id, c.name, cur.total::text as current_total, prev.avg::bigint::text as avg_total
        from cur join prev on prev.category_id is not distinct from cur.category_id
        left join categories c on c.id = cur.category_id
        where prev.avg > 0 and cur.total > prev.avg * 1.5
        order by cur.total - prev.avg desc limit 5`);
      return result.rows.map((r) => {
        const current = BigInt(r.current_total);
        const average = BigInt(r.avg_total);
        return { categoryId: r.category_id, name: r.name ?? "Sin categoría", currentMinor: current, averageMinor: average, increasePct: Number(((current - average) * 1000n) / average) / 10 };
      });
    });
  }

  /** Saldos de las cuentas de una moneda al inicio y al cierre del período. */
  async accountBalances(ctx: TenantContext, raw: PeriodInput) {
    const p = periodInput.parse(raw);
    return this.run(ctx, async (tx) => {
      const result = await tx.execute<{ id: string; name: string; opening: string; closing: string }>(sql`
        select a.id, a.name,
          (a.opening_balance_minor + coalesce(sum(case when m.occurred_on < ${p.from} then
              case when m.counter_account_id = a.id then m.amount_minor
                   when m.kind in ('income','refund_in','adjustment_in','contribution') then m.amount_minor
                   else -m.amount_minor end end), 0))::text as opening,
          (a.opening_balance_minor + coalesce(sum(case when m.occurred_on <= ${p.to} then
              case when m.counter_account_id = a.id then m.amount_minor
                   when m.kind in ('income','refund_in','adjustment_in','contribution') then m.amount_minor
                   else -m.amount_minor end end), 0))::text as closing
        from accounts a
        left join movements m on (m.account_id = a.id or m.counter_account_id = a.id) and m.deleted_at is null and m.status = 'completed'
        where a.currency = ${p.currency} and a.is_archived = false
        group by a.id order by a.name`);
      return result.rows.map((r) => ({ id: r.id, name: r.name, openingMinor: BigInt(r.opening), closingMinor: BigInt(r.closing) }));
    });
  }

  /** Movimientos sin cuenta asignada (por ejemplo, históricos importados): se informan aparte en el flujo de caja. */
  async unassignedFlow(ctx: TenantContext, raw: PeriodInput): Promise<bigint> {
    const p = periodInput.parse(raw);
    return this.run(ctx, async (tx) => {
      const result = await tx.execute<{ total: string }>(sql`
        select coalesce(sum(case when kind in ('income','refund_in','adjustment_in','contribution') then amount_minor else -amount_minor end), 0)::text as total
        from movements where account_id is null and kind <> 'transfer' and ${baseWhere(p)}`);
      return BigInt(result.rows[0]?.total ?? "0");
    });
  }
}
