// Renders a ScoutingReport (src/lib/report-core.ts) as a branded, letter-size PDF
// with @react-pdf/renderer. Layout only: every word of data comes from the model.
// Fonts are embedded from src/assets/report-fonts (traced into the functions that
// use this in next.config.ts), so nothing is fetched at render time.
import path from "node:path";
import React from "react";
import { Circle, Document, Font, Line, Link, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate } from "@/lib/agency-format";
import { TOP_UNIT_MIN_HUNTERS, maleGroupName, unparen, type ComboSection, type DateRow, type DateStatus, type ScoutingReport, type ShortlistRow, type UnitDive } from "@/lib/report-core";

// ------------------------------------------------------------
// Fonts and palette
// ------------------------------------------------------------

export const REPORT_FONT_DIR = path.join(process.cwd(), "src", "assets", "report-fonts");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const f = (file: string) => path.join(REPORT_FONT_DIR, file);
  Font.register({
    family: "Jakarta",
    fonts: [
      { src: f("PlusJakartaSans-Regular.ttf"), fontWeight: 400 },
      { src: f("PlusJakartaSans-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: f("PlusJakartaSans-SemiBold.ttf"), fontWeight: 600 },
      { src: f("PlusJakartaSans-Bold.ttf"), fontWeight: 700 },
      { src: f("PlusJakartaSans-ExtraBold.ttf"), fontWeight: 800 },
    ],
  });
  // No automatic hyphenation: hunt codes, unit ids and agency names must stay whole.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const C = {
  dark: "#1F2326",
  gold: "#C9A24A",
  goldDeep: "#8F7128",
  cream: "#FAF6EA",
  ink: "#2B2F33",
  muted: "#61666B",
  faint: "#878C91",
  rule: "#E4E0D6",
  zebra: "#F8F7F3",
  white: "#FFFFFF",
  green: "#2F6B3A",
  greenBg: "#E7F1E8",
  amber: "#835F10",
  amberBg: "#FBF0D6",
  grey: "#565B60",
  greyBg: "#EEEDEA",
};

const s = StyleSheet.create({
  // Line heights are absolute ("12.5pt"): react-pdf 4.9 drops the page-number text when the Page has a
  // lineHeight, and doubles unitless lineHeights set on a Text.
  page: { fontFamily: "Jakarta", fontSize: 8.8, color: C.ink, paddingTop: 40, paddingBottom: 54, paddingHorizontal: 42 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 20, height: 22, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: C.rule, paddingTop: 6, fontSize: 6.8, color: C.faint, lineHeight: 1.2 },
  // Cover
  hero: { backgroundColor: C.dark, marginHorizontal: -42, marginTop: -40, paddingHorizontal: 42, paddingTop: 30, paddingBottom: 20, marginBottom: 16 },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brand: { color: C.white, fontSize: 17, fontWeight: 800, marginLeft: 7, letterSpacing: 0.2, lineHeight: "18.7pt" },
  pro: { backgroundColor: C.gold, color: C.dark, fontSize: 7, fontWeight: 800, paddingHorizontal: 5, paddingVertical: 1.5, marginLeft: 6, borderRadius: 2, lineHeight: "7.7pt" },
  tagline: { color: C.gold, fontSize: 7.2, letterSpacing: 2.2, marginTop: 6, fontWeight: 600 },
  title: { color: C.white, fontSize: 25, fontWeight: 800, marginTop: 16, lineHeight: "28.7pt" },
  subtitle: { color: "#D8D4C8", fontSize: 10.5, marginTop: 4, lineHeight: "13.7pt" },
  metaRow: { flexDirection: "row", marginTop: 14, borderTopWidth: 0.6, borderTopColor: "#3A3F43", paddingTop: 10 },
  metaCell: { flex: 1, paddingRight: 10 },
  metaLabel: { color: C.gold, fontSize: 6.8, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 2 },
  metaValue: { color: C.white, fontSize: 8.6, lineHeight: "11.6pt" },
  // Blocks
  glanceBox: { backgroundColor: C.cream, borderLeftWidth: 3, borderLeftColor: C.gold, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 14 },
  glanceTitle: { fontSize: 11.5, fontWeight: 800, color: C.dark, marginBottom: 6, lineHeight: "13.8pt" },
  bulletRow: { flexDirection: "row", marginBottom: 4.5 },
  bulletDot: { width: 10, color: C.goldDeep, fontWeight: 800 },
  bulletText: { flex: 1, lineHeight: "12.5pt" },
  h1Row: { flexDirection: "row", alignItems: "flex-end", marginBottom: 3 },
  h1Num: { fontSize: 20, fontWeight: 800, color: C.gold, marginRight: 8, lineHeight: "21.0pt" },
  h1: { fontSize: 17, fontWeight: 800, color: C.dark, lineHeight: "19.5pt" },
  h1Sub: { fontSize: 8.4, color: C.muted, marginBottom: 7, lineHeight: "11.3pt" },
  h2: { fontSize: 11.2, fontWeight: 800, color: C.dark, marginTop: 12, marginBottom: 4, lineHeight: "14.0pt" },
  h3: { fontSize: 7.4, fontWeight: 800, color: C.goldDeep, letterSpacing: 1.3, textTransform: "uppercase", marginTop: 13, marginBottom: 4, lineHeight: "9.6pt" },
  p: { marginBottom: 5, lineHeight: "12.5pt" },
  intro: { fontSize: 7.2, color: C.muted, lineHeight: "10.1pt", marginBottom: 5 },
  small: { fontSize: 7.2, color: C.muted, lineHeight: "10.1pt" },
  tiny: { fontSize: 6.6, color: C.faint, lineHeight: "8.9pt" },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  chip: { fontSize: 7, fontWeight: 700, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginRight: 4, marginBottom: 3 },
  callout: { borderWidth: 0.6, borderColor: C.rule, backgroundColor: C.zebra, padding: 9, marginBottom: 8 },
  sectionRule: { borderTopWidth: 1.5, borderTopColor: C.gold, marginTop: 18, marginBottom: 12, width: 40 },
  // Tables. No border on the table View itself: react-pdf can mis-draw borders on a View split across pages.
  thead: { flexDirection: "row", backgroundColor: C.dark, flexShrink: 0 },
  th: { color: C.white, fontSize: 6.8, fontWeight: 700, paddingVertical: 4, paddingHorizontal: 5, letterSpacing: 0.2, lineHeight: "8.5pt" },
  tr: { flexDirection: "row", flexShrink: 0, borderBottomWidth: 0.6, borderLeftWidth: 0.6, borderRightWidth: 0.6, borderColor: C.rule },
  td: { fontSize: 7.5, paddingVertical: 3.6, paddingHorizontal: 5, lineHeight: "10.1pt" },
  num: { textAlign: "right" },
  caption: { fontSize: 6.6, color: C.faint, marginTop: 1, marginBottom: 4 },
});

const STATUS_CHIP: Record<DateStatus, { label: string; color: string; bg: string }> = {
  confirmed: { label: "Confirmed", color: C.green, bg: C.greenBg },
  rule: { label: "Tentative: by rule", color: C.amber, bg: C.amberBg },
  tentative: { label: "Tentative", color: C.amber, bg: C.amberBg },
  reference: { label: "Last cycle", color: C.grey, bg: C.greyBg },
};

// ------------------------------------------------------------
// Small pieces
// ------------------------------------------------------------

const fmtN = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"));
const fmtP = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v.toFixed(1))}%`);
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** Tables of up to this many rows are kept on one page with their heading. */
const KEEP_ROWS = 5;

function Logo({ size = 16, color = C.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.6" stroke={color} strokeWidth={2.4} fill="none" />
      <Line x1="22" y1="12" x2="17.5" y2="12" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1="6.5" y1="12" x2="2" y2="12" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1="12" y1="6.5" x2="12" y2="2" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1="12" y1="22" x2="12" y2="17.5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function CheckBox() {
  return (
    <Svg width={8} height={8} viewBox="0 0 10 10" style={{ marginTop: 2.2 }}>
      <Rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke={C.gold} strokeWidth={1} fill="none" />
    </Svg>
  );
}

function Chip({ text, color = C.dark, bg = C.greyBg }: { text: string; color?: string; bg?: string }) {
  return <Text style={[s.chip, { color, backgroundColor: bg }]}>{text}</Text>;
}

function Src({ ids, note }: { ids: (number | null | undefined)[]; note?: string }) {
  const list = [...new Set(ids.filter((n): n is number => !!n))].sort((a, b) => a - b);
  if (!list.length && !note) return null;
  return (
    <Text style={s.caption}>
      {note ? `${note} ` : ""}
      {list.length ? `Source${list.length > 1 ? "s" : ""}: ${list.map((n) => `[${n}]`).join(" ")}.` : ""}
    </Text>
  );
}

interface Col {
  label: string;
  w: number;
  align?: "right" | "left";
}

/**
 * `head` (a Block's heading) is drawn inside the table's first, non-splitting group, so the heading,
 * column header and first row always share a page. (A prop, not React context: context isn't
 * available in Next's server build.)
 */
function Table({ cols, rows, zebra = true, head }: { cols: Col[]; rows: React.ReactNode[][]; zebra?: boolean; head?: React.ReactNode }) {
  const row = (r: React.ReactNode[], ri: number) => (
    <View key={ri} style={[s.tr, zebra && ri % 2 === 1 ? { backgroundColor: C.zebra } : {}]} wrap={ri === 0 ? undefined : false}>
      {r.map((cell, ci) => (
        <View key={ci} style={[s.td, { width: `${cols[ci].w}%` }]}>
          {typeof cell === "string" || typeof cell === "number" ? <Text style={cols[ci].align === "right" ? s.num : {}}>{cell}</Text> : cell}
        </View>
      ))}
    </View>
  );
  // A fragment, not a wrapping View: react-pdf mis-paginates a non-wrapping group that is the
  // first child of nested wrapping Views (it squashes the rows into the space left on the page).
  return (
    <>
      {/* The header never ends a page on its own: it travels with the first row. */}
      <View wrap={false}>
        {head}
        <View style={s.thead}>
          {cols.map((c, i) => (
            <Text key={i} style={[s.th, { width: `${c.w}%` }, c.align === "right" ? s.num : {}]}>
              {c.label}
            </Text>
          ))}
        </View>
        {rows.length ? row(rows[0], 0) : null}
      </View>
      {rows.slice(1).map((r, i) => row(r, i + 1))}
      <View style={{ height: 3 }} />
    </>
  );
}

/**
 * A titled block: heading, intro and table. Short tables stay on one page with their heading;
 * long ones keep the heading with the intro and let the rows flow.
 */
function Block({ title, intro, rows, children, level = 3 }: { title: React.ReactNode; intro?: React.ReactNode; rows: number; children: React.ReactNode; level?: 2 | 3 }) {
  const head = (
    <>
      <Text style={level === 2 ? s.h2 : s.h3}>{title}</Text>
      {intro ? <View style={{ marginBottom: 1 }}>{typeof intro === "string" ? <Text style={s.intro}>{intro}</Text> : intro}</View> : null}
    </>
  );
  if (rows <= KEEP_ROWS) {
    return (
      <View wrap={false} style={{ flexShrink: 0 }}>
        {head}
        {children}
      </View>
    );
  }
  // Long tables flow across pages; the heading rides in the table's first, non-splitting group.
  // A fragment, so that group isn't the first child of a wrapping View (see Table).
  const [first, ...rest] = React.Children.toArray(children);
  return (
    <>
      {React.isValidElement<{ head?: React.ReactNode }>(first) ? React.cloneElement(first, { head }) : first}
      {rest}
    </>
  );
}

function Bullets({ items, check = false }: { items: React.ReactNode[]; check?: boolean }) {
  return (
    <>
      {items.map((it, i) => (
        <View key={i} style={s.bulletRow} wrap={false}>
          {check ? (
            <View style={{ width: 13 }}>
              <CheckBox />
            </View>
          ) : (
            <Text style={s.bulletDot}>•</Text>
          )}
          <Text style={s.bulletText}>{it}</Text>
        </View>
      ))}
    </>
  );
}

/** URLs broken at "/" so they wrap without hyphens. */
function wrapUrl(url: string, width = 100): string {
  if (url.length <= width) return url;
  const parts = url.split(/(?<=\/)/);
  const lines: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > width && cur) {
      lines.push(cur);
      cur = "";
    }
    cur += p;
    while (cur.length > width) {
      lines.push(cur.slice(0, width));
      cur = cur.slice(width);
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

/** Notes shared by every row are printed once under the table instead of on each row. */
function sharedNote<T extends { note?: string }>(rows: readonly T[]): string | undefined {
  if (rows.length < 2) return undefined;
  const first = rows[0].note;
  return first && rows.every((r) => r.note === first) ? first : undefined;
}

// ------------------------------------------------------------
// Sections
// ------------------------------------------------------------

function StatusCell({ status }: { status: DateStatus }) {
  const c = STATUS_CHIP[status];
  return <Text style={[s.chip, { color: c.color, backgroundColor: c.bg, alignSelf: "flex-start", marginRight: 0, marginBottom: 0 }]}>{c.label}</Text>;
}

function DatesTable({ rows, head }: { rows: DateRow[]; head?: React.ReactNode }) {
  const shared = sharedNote(rows);
  return (
    <>
      <Table
        head={head}
        cols={[
          { label: "Date", w: 22 },
          { label: "What", w: 58 },
          { label: "Status", w: 20 },
        ]}
        rows={rows.map((r) => [
          <Text key="d" style={{ fontWeight: 700 }}>
            {r.when}
          </Text>,
          <View key="l">
            <Text style={{ fontWeight: 600 }}>{r.label}</Text>
            {r.note && !shared ? <Text style={s.tiny}>{r.note}</Text> : null}
          </View>,
          <StatusCell key="s" status={r.status} />,
        ])}
      />
      <Src ids={rows.map((r) => r.src)} note={shared} />
    </>
  );
}

function HarvestBars({ unit }: { unit: UnitDive }) {
  const pts = unit.harvest!.points;
  const H = 44;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 2, borderBottomWidth: 0.6, borderBottomColor: C.rule, paddingBottom: 3, alignSelf: "flex-start" }}>
      {pts.map((p, i) => (
        <View key={p.year} style={{ width: 54, alignItems: "center" }}>
          <Text style={{ fontSize: 7.6, fontWeight: 700, marginBottom: 2, color: i === pts.length - 1 ? C.dark : C.muted }}>{fmtP(p.success)}</Text>
          <View style={{ width: 24, height: Math.max(1.5, (H * Math.min(100, p.success)) / 100), backgroundColor: i === pts.length - 1 ? C.gold : "#DCD3B6" }} />
        </View>
      ))}
    </View>
  );
}

function HarvestYears({ unit }: { unit: UnitDive }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 4 }}>
      {unit.harvest!.points.map((p) => (
        <View key={p.year} style={{ width: 54, alignItems: "center" }}>
          <Text style={{ fontSize: 7, fontWeight: 700, color: C.ink }}>{p.year}</Text>
          <Text style={{ fontSize: 6.2, color: C.faint }}>{fmtN(p.hunters)} hunters</Text>
        </View>
      ))}
    </View>
  );
}

function UnitBlock({ c, u }: { c: ComboSection; u: UnitDive }) {
  const pts = c.points;
  const atLabel = c.pointsMatter && pts !== null ? `At your ${pts} pts` : null;
  const cols: Col[] = [
    { label: "Hunt", w: atLabel ? 32 : 40 },
    { label: "Quota", w: 7, align: "right" },
    { label: "Applicants", w: 10, align: "right" },
    { label: "Drawn", w: 8, align: "right" },
    { label: "Odds", w: 8, align: "right" },
    { label: c.pointsMatter ? "Lowest pts drawn" : "", w: c.pointsMatter ? 10 : 1, align: "right" },
    ...(atLabel ? [{ label: atLabel, w: 11, align: "right" as const }] : []),
    { label: "Harvest success", w: atLabel ? 14 : 16, align: "right" },
  ];
  const huntSrc = u.hunts.flatMap((h) => [h.src, h.harvest?.src]);
  return (
    <>
      <View wrap={false}>
        <Text style={s.h2}>
          {c.unitTerm} {u.unit}
          {u.name && u.name !== u.unit ? <Text style={{ fontWeight: 600, color: C.muted }}> · {u.name}</Text> : null}
        </Text>
        {u.harvest ? (
          <>
            <Text style={s.intro}>
              {c.speciesLabel} harvest success by year, {u.harvest.label.toLowerCase()}
              {u.harvest.points.some((p) => p.computed) ? " (harvest ÷ hunters where the agency printed no rate)" : ""}.
            </Text>
            <HarvestBars unit={u} />
            <HarvestYears unit={u} />
            <Src ids={u.harvest.points.map((p) => p.src)} />
          </>
        ) : (
          <Text style={s.intro}>{u.harvestNote}</Text>
        )}
      </View>
      {u.hunts.length ? (
        <Block
          title={`${u.drawYear} draw results, ${c.unitTerm} ${u.unit}`}
          rows={u.hunts.length}
          intro={`${c.residency === "resident" ? "Resident" : "Nonresident"} applicants${c.pointsMatter && pts !== null ? `, and applicants at exactly your ${pts} ${c.pointName || "point"}s` : ""}. Odds = drawn ÷ applicants${u.hunts.some((h) => h.pool === "total") ? "; some hunts report one combined resident and nonresident pool" : ""}.`}
        >
          <Table
            cols={cols}
            rows={u.hunts.map((h) => [
              <View key="h">
                <Text style={{ fontWeight: 700 }}>{h.huntCode}</Text>
                <Text style={s.tiny}>{h.label}</Text>
                {h.season ? <Text style={s.tiny}>Season: {h.season}</Text> : null}
              </View>,
              fmtN(h.quota),
              fmtN(h.applicants),
              fmtN(h.drawn),
              fmtP(h.odds),
              c.pointsMatter ? (h.minPoints === null ? "—" : String(h.minPoints)) : "",
              ...(atLabel ? [h.atPoints ? `${h.atPoints.drawn} of ${h.atPoints.applicants}` : "none listed"] : []),
              h.harvest ? (
                <View key="hv">
                  <Text style={s.num}>{fmtP(h.harvest.pct)}</Text>
                  <Text style={[s.tiny, s.num]}>
                    {h.harvest.year} · {h.harvest.matchedBy === "hunt" ? "this hunt" : "unit"}
                  </Text>
                </View>
              ) : (
                "—"
              ),
            ])}
          />
          <Src
            ids={huntSrc}
            note={[u.methodNote, u.moreHunts > 0 ? `${u.moreHunts} more ${u.methodNote ? "matching " : ""}${c.unitTerm} ${u.unit} hunt${u.moreHunts === 1 ? " isn't" : "s aren't"} listed here; HuntScout has every hunt.` : "", atLabel ? `"none listed" = the agency's point table lists no ${c.residency} applicants at ${pts} points for that hunt.` : ""].filter(Boolean).join(" ")}
          />
        </Block>
      ) : (
        <Text style={s.intro}>
          No {c.speciesLabel.toLowerCase()} draw hunts list {c.unitTerm} {u.unit} in our {c.agencyShort} draw data.
        </Text>
      )}
      {u.history.rows.length ? (
        <Block title={`Draw history, ${c.unitTerm} ${u.unit}`} rows={u.history.rows.length} intro={`${c.residency === "resident" ? "Resident" : "Nonresident"} odds each year${c.pointsMatter ? " · lowest point level drawn" : ""}. "—" = not offered or no figures that year.`}>
          <Table
            cols={[{ label: "Hunt", w: 20 }, ...u.history.years.map((y) => ({ label: String(y), w: 80 / u.history.years.length, align: "right" as const }))]}
            rows={u.history.rows.map((r) => [
              <Text key="c" style={{ fontWeight: 700 }}>
                {r.huntCode}
              </Text>,
              ...r.cells.map((cell) => (cell ? `${fmtP(cell.odds)}${c.pointsMatter && cell.minPoints !== null ? ` · ${cell.minPoints} pts` : ""}` : "—")),
            ])}
          />
          <Src ids={u.history.rows.flatMap((r) => r.cells.map((cell) => cell?.src))} />
        </Block>
      ) : null}
    </>
  );
}

function ShortlistTable({ rows, year, head }: { rows: ShortlistRow[]; year: number | null; head?: React.ReactNode }) {
  return (
    <Table
      head={head}
      cols={[
        { label: "Hunt", w: 45 },
        { label: "Units", w: 13 },
        { label: `${year ?? ""} result, your pool`, w: 27 },
        { label: "Harvest success", w: 15, align: "right" },
      ]}
      rows={rows.map((r) => [
        <View key="h">
          <Text style={{ fontWeight: 700 }}>{r.huntCode}</Text>
          <Text style={s.tiny}>{r.label}</Text>
        </View>,
        r.units.length ? `${r.units.slice(0, 4).join(", ")}${r.units.length > 4 ? ` +${r.units.length - 4}` : ""}` : "—",
        r.result,
        r.harvestPct !== null ? `${fmtP(r.harvestPct)} (${r.harvestYear})` : "—",
      ])}
    />
  );
}

function ComboBlock({ c }: { c: ComboSection }) {
  const d = c.dates;
  const pointsChip = !c.pointsMatter ? "Points don't affect this draw" : c.points !== null ? `Your ${c.pointName || "point"}s: ${c.points}` : `Your ${c.pointName || "point"}s: not given`;
  const sl = c.shortlist;
  const primary = sl?.rows.filter((r) => !r.antlerless) || [];
  const antlerless = sl?.rows.filter((r) => r.antlerless) || [];
  const seasonNote = sharedNote(c.seasons.rows);

  return (
    <>
      <View wrap={false}>
        <View style={s.sectionRule} />
        <View style={s.h1Row}>
          <Text style={s.h1Num}>{c.id}</Text>
          <Text style={s.h1}>
            {c.stateName} {c.speciesLabel.toLowerCase()}
          </Text>
        </View>
        <Text style={s.h1Sub}>
          {c.agencyName}
          {c.speciesNote ? ` · ${c.speciesNote}` : ""}
        </Text>
        <View style={s.chips}>
          <Chip text={c.residency === "resident" ? "Resident" : "Nonresident"} />
          <Chip text={c.drawSystemLabel} />
          <Chip text={pointsChip} color={C.goldDeep} bg={C.cream} />
          <Chip text={c.residencyBasis} color={C.muted} bg="#F3F2EF" />
        </View>
        <Text style={s.h3}>How the draw works</Text>
        <Text style={s.p}>{c.summary}</Text>
      </View>
      {c.residencyNote ? (
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>{c.residency === "resident" ? "Residents: " : "Nonresidents: "}</Text>
          {c.residencyNote}
        </Text>
      ) : null}
      {c.otcSummary ? (
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>Over the counter: </Text>
          {c.otcSummary}
        </Text>
      ) : null}

      {d.upcoming.length ? (
        <Block title={`Key dates${d.planCycle ? ` for the ${d.planCycle} draw` : ""}`} rows={d.upcoming.length}>
          <DatesTable rows={d.upcoming} />
        </Block>
      ) : null}
      {d.reference.length ? (
        <Block
          title={d.upcoming.length ? `Not yet published for ${d.planCycle}: last cycle's dates` : `Key dates: ${d.planCycle ?? "next"} not yet published`}
          rows={d.reference.length}
          intro={
            d.upcoming.length
              ? `${c.agencyShort} hasn't published these ${d.planCycle} dates yet. The ${d.referenceCycle} dates show when each step fell last time; they are not this year's deadlines.`
              : `${c.agencyShort} hasn't published ${d.planCycle ?? "next"} dates for ${c.speciesLabel.toLowerCase()} yet. The ${d.referenceCycle} schedule below is for reference only.`
          }
        >
          <DatesTable rows={d.reference} />
        </Block>
      ) : null}

      {c.seasons.rows.length ? (
        <Block
          title={`${c.seasons.year} ${c.seasons.specialOnly ? "special-area hunts" : "seasons"}${c.seasons.forPlanCycle ? "" : ` (${d.planCycle ?? "next"} not yet published)`}`}
          rows={c.seasons.rows.length}
          intro={
            c.seasons.specialOnly
              ? `${c.agencyShort} prints these ${c.speciesLabel.toLowerCase()} hunts without a hunt number: they are special-area or eligibility hunts, not the general seasons. Each numbered hunt's own dates are on HuntScout and, where published, in the draw tables below.`
              : `Season dates ${c.agencyShort} lists statewide or by area rather than per hunt code${c.seasons.methodFiltered ? ", for your methods" : ""}. A drawn hunt's own dates are on HuntScout and, where published, in the draw tables below.`
          }
        >
          <Table
            cols={[
              { label: "Season", w: 42 },
              { label: "Dates", w: 22 },
              { label: "Where", w: 36 },
            ]}
            rows={c.seasons.rows.map((r) => [
              <View key="l">
                <Text style={{ fontWeight: 600 }}>{r.label}</Text>
                {r.note && !seasonNote ? <Text style={s.tiny}>{r.note}</Text> : null}
              </View>,
              r.when,
              r.scope,
            ])}
          />
          <Src ids={c.seasons.rows.map((r) => r.src)} note={seasonNote} />
        </Block>
      ) : null}

      {c.fees.rows.length ? (
        <Block title={`${c.residency === "resident" ? "Resident" : "Nonresident"} fees`} rows={c.fees.rows.length}>
          <Table
            cols={[
              { label: "Item, as the agency lists it", w: 60 },
              { label: "Type", w: 20 },
              { label: "Amount", w: 20, align: "right" },
            ]}
            rows={c.fees.rows.map((f) => [
              <View key="i">
                <Text>{f.item}</Text>
                {f.note ? <Text style={s.tiny}>{f.note}</Text> : null}
              </View>,
              f.group === "apply" ? "Application / points" : f.group === "species" ? `${c.speciesLabel} license` : "All species",
              <Text key="a" style={s.num}>
                <Text style={{ fontWeight: 700 }}>{usd(f.amount)}</Text> ({f.licenseYear})
              </Text>,
            ])}
          />
          <Src ids={c.fees.rows.map((r) => r.src)} />
        </Block>
      ) : null}

      {c.units.length ? (
        <>
          <View wrap={false}>
            <Text style={s.h3}>Your units</Text>
          </View>
          {c.units.map((u) => (
            <UnitBlock key={u.unit} c={c} u={u} />
          ))}
        </>
      ) : c.topUnits ? (
        <Block
          title={`Top ${c.unitTerm}s by harvest success, ${c.topUnits.year}`}
          rows={c.topUnits.rows.length}
          intro={`${c.unitsAsked ? "" : "You didn't name units we could match, so here are the "}${c.unitsAsked ? "U" : "u"}nits with ${TOP_UNIT_MIN_HUNTERS}+ reported hunters, ranked by ${c.agencyShort}'s published success rate (${unparen(c.topUnits.label).toLowerCase()}). Success rate alone says nothing about access, crowding or animal quality.`}
        >
          {(() => {
            const named = c.topUnits.rows.some((r) => r.name);
            return (
              <Table
                cols={[
                  { label: c.unitTerm, w: named ? 14 : 28 },
                  ...(named ? [{ label: "Name", w: 38 }] : []),
                  { label: "Hunters", w: named ? 16 : 24, align: "right" as const },
                  { label: "Harvest", w: named ? 16 : 24, align: "right" as const },
                  { label: "Success", w: named ? 16 : 24, align: "right" as const },
                ]}
                rows={c.topUnits.rows.map((r) => [
                  <Text key="u" style={{ fontWeight: 700 }}>
                    {r.unit}
                  </Text>,
                  ...(named ? [r.name || "—"] : []),
                  fmtN(r.hunters),
                  fmtN(r.harvest),
                  fmtP(r.success),
                ])}
              />
            );
          })()}
          <Src ids={c.topUnits.rows.map((r) => r.src)} />
        </Block>
      ) : null}

      {sl && sl.rows.length ? (
        <>
          {/* The heading, intro and group label ride in the first table's header group (see Block). */}
          <ShortlistTable
            rows={primary.length ? primary : antlerless}
            year={sl.drawYear}
            head={
              <>
                <Text style={s.h3}>Where you can realistically draw</Text>
                <Text style={s.intro}>
                  {c.agencyShort}&apos;s {sl.drawYear} draw results for {c.residency} applicants
                  {c.pointsMatter && c.points !== null ? `, matched to your ${c.points} ${c.pointName || "point"}s` : ""}: hunts drawn at your level first, then by odds. {sl.matched} hunts qualified; the top {sl.rows.length} are listed. {sl.notes.join(" ")}
                </Text>
                {primary.length && antlerless.length ? (
                  <Text style={[s.small, { fontWeight: 700, color: C.ink, marginBottom: 3 }]}>
                    {maleGroupName(c.species)[0].toUpperCase() + maleGroupName(c.species).slice(1)} hunts
                  </Text>
                ) : !primary.length ? (
                  <Text style={[s.small, { fontWeight: 700, color: C.ink, marginBottom: 3 }]}>Antlerless hunts</Text>
                ) : null}
              </>
            }
          />
          {primary.length && antlerless.length ? (
            <View wrap={false} style={{ marginTop: 5 }}>
              <Text style={[s.small, { fontWeight: 700, color: C.ink, marginBottom: 3 }]}>Antlerless hunts</Text>
              <ShortlistTable rows={antlerless} year={sl.drawYear} />
            </View>
          ) : null}
          <Src ids={sl.rows.map((r) => r.src)} />
        </>
      ) : null}

      <View wrap={false}>
        <Text style={s.h3}>Your application checklist</Text>
        <Bullets check items={c.checklist} />
      </View>
    </>
  );
}

// ------------------------------------------------------------
// Document
// ------------------------------------------------------------

export function ReportDocument({ report: r }: { report: ScoutingReport }) {
  const who = r.name || "HuntScout Pro member";
  const compiled = formatDate(r.generatedOn);
  const subtitle = [r.stateNames.join(", ") || null, r.speciesLabels.join(", ") || null, `${r.season} application season`].filter(Boolean).join(" · ");
  const residency = r.answers.find((a) => a.label === "Residency")?.value || "";
  const budget = r.combos.filter((c) => c.fees.rows.length);
  const created = new Date(`${r.generatedOn}T12:00:00Z`);

  return (
    <Document title={`HuntScout Pro Scouting Report: ${who}`} author="HuntScout Pro" subject="Personal scouting report" creator="HuntScout Pro" producer="HuntScout Pro" language="en-US" creationDate={created}>
      <Page size="LETTER" style={s.page} wrap>
        <View style={s.footer} fixed>
          <Text style={{ width: 440 }}>
            HuntScout Pro · Scouting report for {who} · {compiled} · Verify dates and rules with the agency before you apply.
          </Text>
        </View>
        <Text
          style={{ position: "absolute", right: 42, bottom: 22, width: 100, height: 14, textAlign: "right", fontSize: 6.8, color: C.faint }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />

        {/* Cover */}
        <View style={s.hero}>
          <View style={s.brandRow}>
            <Logo size={17} />
            <Text style={s.brand}>HuntScout</Text>
            <Text style={s.pro}>PRO</Text>
          </View>
          <Text style={s.tagline}>KNOW BEFORE YOU DRAW</Text>
          <Text style={s.title}>Personal Scouting Report</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>Prepared for</Text>
              <Text style={s.metaValue}>{who}</Text>
            </View>
            <View style={[s.metaCell, { flex: 1.5 }]}>
              <Text style={s.metaLabel}>Your hunts</Text>
              <Text style={s.metaValue}>{r.combos.length ? r.combos.map((c) => `${c.abbrev} ${c.speciesLabel.toLowerCase()}`).join(", ") : subtitle}</Text>
            </View>
            <View style={[s.metaCell, { flex: 1.3 }]}>
              <Text style={s.metaLabel}>Residency</Text>
              <Text style={s.metaValue}>{residency}</Text>
            </View>
            <View style={[s.metaCell, { flex: 0.8, paddingRight: 0 }]}>
              <Text style={s.metaLabel}>Compiled</Text>
              <Text style={s.metaValue}>{compiled}</Text>
            </View>
          </View>
        </View>

        {r.takeaways.length ? (
          <View style={s.glanceBox} wrap={false}>
            <Text style={s.glanceTitle}>Your plan at a glance</Text>
            <Bullets
              items={r.takeaways.map((t, i) => (
                <Text key={i}>
                  <Text style={{ fontWeight: 700 }}>{t.lead}</Text> {t.text}
                </Text>
              ))}
            />
          </View>
        ) : null}

        {r.glance.length ? (
          <Block
            level={2}
            title="Key application dates"
            rows={r.glance.length}
            intro={`Application and point deadlines for your states and species, soonest first. "Tentative: by rule" = the agency's regulation fixes the date every year, but the agency hasn't announced it yet. "Last cycle" = shown only where the new date isn't published.`}
          >
            <Table
              cols={[
                { label: "Date", w: 20 },
                { label: "State", w: 12 },
                { label: "Species", w: 14 },
                { label: "What", w: 37 },
                { label: "Status", w: 17 },
              ]}
              rows={r.glance.map((g) => [
                <Text key="w" style={{ fontWeight: 700 }}>
                  {g.when}
                </Text>,
                g.stateName,
                g.species.join(", "),
                g.label,
                <StatusCell key="s" status={g.status} />,
              ])}
            />
          </Block>
        ) : null}

        <Block level={2} title="What you told us" rows={r.answers.length}>
          <Table
            zebra={false}
            cols={[
              { label: "Question", w: 22 },
              { label: "Your answer", w: 78 },
            ]}
            rows={r.answers.map((a) => [
              <Text key="l" style={{ fontWeight: 700 }}>
                {a.label}
              </Text>,
              a.value,
            ])}
          />
          {r.readNotes.length ? (
            <View style={{ marginTop: 4 }}>
              {r.readNotes.map((n, i) => (
                <Text key={i} style={[s.small, { marginBottom: 2 }]}>
                  {n}
                </Text>
              ))}
            </View>
          ) : null}
        </Block>

        {r.compact.length || r.comingSoon.length || r.notCovered.length ? (
          <>
            {r.compact.length ? (
              <Block
                level={2}
                title={r.combos.length ? "Also on your list" : "Your states and species"}
                rows={r.compact.length}
                intro={
                  r.combos.length
                    ? "This report covers your first state and species pairs in depth. The rest, at a glance:"
                    : "Tell us your species (or your states) and we'll send a full report. Meanwhile, the next application date for each:"
                }
              >
                <Table
                  cols={[
                    { label: "State", w: 14 },
                    { label: "Species", w: 16 },
                    { label: "Draw", w: 18 },
                    { label: "Next application date", w: 52 },
                  ]}
                  rows={r.compact.map((x) => [
                    x.stateName,
                    x.speciesLabel,
                    x.drawSystemLabel,
                    `${x.next}${x.status === "reference" ? " (last cycle; new dates not published)" : x.status === "rule" ? " (tentative, by rule)" : x.status === "tentative" ? " (tentative)" : ""}`,
                  ])}
                />
              </Block>
            ) : (
              <Text style={s.h2}>{r.combos.length ? "Also on your list" : "Your states and species"}</Text>
            )}
            {r.notCovered.map((n, i) => (
              <Text key={i} style={[s.small, { marginTop: 2 }]}>
                {n}
              </Text>
            ))}
            {r.comingSoon.length ? (
              <Text style={[s.small, { marginTop: 4 }]}>
                Not covered yet: {r.comingSoon.join(", ")}. HuntScout Pro has agency data for 14 western states today, and your picks count toward which state we add next.
              </Text>
            ) : null}
          </>
        ) : null}

        {r.combos.map((c) => (
          <ComboBlock key={c.id} c={c} />
        ))}

        {/* Budget */}
        {budget.length ? (
          <View wrap={false}>
            <View style={s.sectionRule} />
            <Text style={s.h1}>Budget: the agency fee lines</Text>
            <Text style={[s.intro, { marginTop: 4, marginBottom: 7 }]}>
              What each agency lists for your residency, by type. We don&apos;t total these for you: which licenses and stamps you need depends on your age, the license type and what you already hold. Each section&apos;s fee table shows every line with its source.
            </Text>
            <Table
              cols={[
                { label: "State · species", w: 18 },
                { label: "Application & points", w: 31 },
                { label: "Licenses & stamps (all species)", w: 30 },
                { label: "License / tag if drawn", w: 21, align: "right" },
              ]}
              rows={budget.map((c) => {
                const list = (g: string) => {
                  const rows = c.fees.rows.filter((f) => f.group === g);
                  return rows.length
                    ? rows.slice(0, 4).map((f) => `${usd(f.amount)}  ${f.item}`).join("\n") + (rows.length > 4 ? `\n+${rows.length - 4} more` : "")
                    : "—";
                };
                const rg = c.fees.speciesRange;
                return [
                  <Text key="t" style={{ fontWeight: 700 }}>
                    {c.abbrev} {c.speciesLabel.toLowerCase()}
                  </Text>,
                  list("apply"),
                  list("general"),
                  rg ? (rg.min === rg.max ? usd(rg.min) : `${usd(rg.min)} – ${usd(rg.max)}\n${rg.count} license types`) : "—",
                ];
              })}
            />
          </View>
        ) : null}

        {/* Next steps */}
        <View wrap={false}>
          <View style={s.sectionRule} />
          <Text style={s.h1}>Next steps with HuntScout Pro</Text>
          <View style={{ marginTop: 8 }}>
            <Bullets
              items={[
                <Text key="1">
                  <Text style={{ fontWeight: 700 }}>Add your hunts to the Hunt Planner</Text> (huntscoutpro.com/planner). It keeps each hunt&apos;s agency dates, fees and your points in one place and exports them to your calendar.
                </Text>,
                <Text key="2">
                  <Text style={{ fontWeight: 700 }}>Keep deadline reminders on</Text> (My Account). We email you 14 and 3 days before application deadlines for your states and species.
                </Text>,
                <Text key="3">
                  <Text style={{ fontWeight: 700 }}>Run &quot;Where can I draw?&quot;</Text> (huntscoutpro.com/shortlist) with your points for each state. Saved points also sharpen your next report.
                </Text>,
                <Text key="4">
                  <Text style={{ fontWeight: 700 }}>Open any unit</Text> on huntscoutpro.com/states for every hunt code, draw year and harvest year we have.
                </Text>,
                <Text key="5">
                  <Text style={{ fontWeight: 700 }}>Reply to the email this came with</Text> to correct anything we read wrong (units, points, residency) or to ask a question. Adam reads every reply.
                </Text>,
              ]}
            />
          </View>
          <View style={[s.callout, { marginTop: 8 }]}>
            <Text style={{ fontWeight: 700, marginBottom: 2 }}>About this report</Text>
            <Text style={s.small}>
              Every number comes from the state wildlife agencies&apos; own publications, listed below with the date we retrieved each one. Odds are drawn ÷ applicants from past draws, and harvest success is from past seasons; neither predicts a future draw or hunt. Dates marked tentative or last cycle can change, and regulations, fees and dates change every year: confirm everything with the agency before you apply or hunt. HuntScout Pro is not affiliated with any state agency.
            </Text>
          </View>
        </View>

        {/* Sources: the heading stays with the first entry (a fragment, see Table). */}
        <>
          {r.sources.map((src, i) => {
            const entry = (
              <View key={src.n} style={{ flexDirection: "row", marginBottom: 3.5 }} wrap={false}>
                <Text style={[s.small, { width: 20, fontWeight: 700, color: C.ink }]}>[{src.n}]</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.small, { color: C.ink }]}>
                    {src.title}. {src.publisher}
                    {src.dataYear ? ` (${src.dataYear} data)` : ""}. Retrieved {formatDate(src.retrieved)}.
                  </Text>
                  <Link src={src.url} style={{ fontSize: 6.6, color: C.goldDeep, textDecoration: "none" }}>
                    {wrapUrl(src.url)}
                  </Link>
                </View>
              </View>
            );
            return i === 0 ? (
              <View key="first" wrap={false}>
                <Text style={[s.h2, { marginTop: 12 }]}>Sources</Text>
                {entry}
              </View>
            ) : (
              entry
            );
          })}
        </>
      </Page>
    </Document>
  );
}

/** The report as PDF bytes. */
export async function renderReportPdf(report: ScoutingReport): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument report={report} />);
}
