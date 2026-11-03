import "server-only";
import { formatMoney } from "@/lib/money";
import { brand } from "@/config/brand";
import type { Table } from "./exporters";

/**
 * PDF con @react-pdf/renderer (Helvetica: incluye tildes y ñ). Encabezado fijo en cada página,
 * numeración y pie con la fecha de emisión. Se carga de forma diferida: solo lo usan las exportaciones.
 */
export async function renderTablesPdf(input: { organizationName: string; title: string; subtitle: string; tables: Table[]; currency: string; locale: string; generatedAt: Date; timezone: string }): Promise<Uint8Array> {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import("@react-pdf/renderer");
  const styles = StyleSheet.create({
    page: { paddingTop: 72, paddingBottom: 48, paddingHorizontal: 36, fontSize: 8.5, fontFamily: "Helvetica", color: "#0B1A2E" },
    header: { position: "absolute", top: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E3E7EE", paddingBottom: 8 },
    brand: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1.2 },
    accent: { color: "#1D5BFF" },
    org: { fontSize: 9, color: "#3D4B63" },
    title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    subtitle: { fontSize: 9, color: "#627089", marginBottom: 14 },
    tableTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 6 },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E3E7EE", paddingVertical: 3.5 },
    head: { flexDirection: "row", backgroundColor: "#0B1A2E", color: "#FFFFFF", paddingVertical: 4, fontFamily: "Helvetica-Bold" },
    foot: { flexDirection: "row", paddingVertical: 4, fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderTopColor: "#0B1A2E" },
    footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#627089" },
  });
  const widthFor = (table: Table, i: number) => {
    const total = table.columns.reduce((a, c) => a + (c.width ?? 14), 0);
    return `${((table.columns[i]!.width ?? 14) / total) * 100}%`;
  };
  const format = (value: string | bigint | number | null, kind: Table["columns"][number]["kind"]) => {
    if (value === null) return "";
    if (kind === "money" && typeof value === "bigint") return formatMoney(value, input.currency, input.locale);
    if (kind === "date" && typeof value === "string") return value.split("-").reverse().join("/");
    if (kind === "percent" && typeof value === "number") return `${value.toLocaleString(input.locale)} %`;
    return String(value);
  };
  const right = (kind: string) => (kind === "money" || kind === "integer" || kind === "percent" ? { textAlign: "right" as const } : {});
  const generated = input.generatedAt.toLocaleString(input.locale, { timeZone: input.timezone });

  const doc = (
    <Document title={`${input.title} · ${input.organizationName}`} author={input.organizationName} creator={brand.name} producer={brand.name}>
      <Page size="A4" orientation={input.tables.some((t) => t.columns.length > 7) ? "landscape" : "portrait"} style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>
            {brand.wordmark} <Text style={styles.accent}>{brand.numeral}</Text>
          </Text>
          <Text style={styles.org}>{input.organizationName}</Text>
        </View>
        <Text style={styles.title}>{input.title}</Text>
        <Text style={styles.subtitle}>{input.subtitle}</Text>
        {input.tables.map((table) => (
          <View key={table.title} wrap>
            {input.tables.length > 1 ? <Text style={styles.tableTitle}>{table.title}</Text> : null}
            <View style={styles.head} fixed>
              {table.columns.map((c, i) => (
                <Text key={c.header} style={{ width: widthFor(table, i), paddingHorizontal: 3, ...right(c.kind) }}>
                  {c.header}
                </Text>
              ))}
            </View>
            {table.rows.map((r, ri) => (
              <View key={ri} style={styles.row} wrap={false}>
                {r.map((v, i) => (
                  <Text key={i} style={{ width: widthFor(table, i), paddingHorizontal: 3, ...right(table.columns[i]!.kind) }}>
                    {format(v, table.columns[i]!.kind)}
                  </Text>
                ))}
              </View>
            ))}
            {table.footer?.map((r, ri) => (
              <View key={`f${ri}`} style={styles.foot} wrap={false}>
                {r.map((v, i) => (
                  <Text key={i} style={{ width: widthFor(table, i), paddingHorizontal: 3, ...right(table.columns[i]!.kind) }}>
                    {format(v, table.columns[i]!.kind)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>Emitido el {generated} · Importes en {input.currency}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
