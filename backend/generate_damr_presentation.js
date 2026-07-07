// Generates "DAMR - End-to-End System Overview.pptx" — a manager-facing,
// ~30-minute walkthrough of the DAMR water-billing platform: architecture,
// data model, feature modules, the native M-Pesa integration, testing, and
// roadmap status.
//
// SETUP (one time):
//   npm install pptxgenjs
//
// RUN:
//   node generate_damr_presentation.js
//
// Output: DAMR - End-to-End System Overview.pptx in the current folder.

const pptxgen = require("pptxgenjs");

// ── Palette — "Ocean Ledger": deep water blue (the utility being billed)
// paired with a warm gold accent (billing/money) and a Safaricom-green
// touch reserved only for the payments slide. ──────────────────────────
const C = {
  primary: "065A82", // deep ocean blue — dominant
  secondary: "1C7293", // teal
  accent: "21295C", // midnight navy
  gold: "F2A541", // warm accent — money / stats / CTAs
  green: "1C9B72", // reserved for M-Pesa/payments slide only
  danger: "C0392B",
  lightBg: "F5F9FA",
  white: "FFFFFF",
  textDark: "1E293B",
  textMuted: "64748B",
  cardBg: "FFFFFF",
  line: "D7E3E8",
};

const HEAD = "Cambria";
const BODY = "Calibri";

function shadow() {
  return { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.12 };
}

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "DAMR Engineering";
pres.title = "DAMR — End-to-End System Overview";

const PAGE_W = 10;
const PAGE_H = 5.625;

// ── Shared helpers ──────────────────────────────────────────────────────

function addLightSlide() {
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  return s;
}

function addDarkSlide() {
  const s = pres.addSlide();
  s.background = { color: C.accent };
  return s;
}

// Standard content-slide header: small gold kicker label + big title.
function addHeader(s, kicker, title) {
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: 0.5, y: 0.32, w: 9, h: 0.3,
      fontFace: BODY, fontSize: 12, bold: true, color: C.gold,
      charSpacing: 2, margin: 0,
    });
  }
  s.addText(title, {
    x: 0.5, y: kicker ? 0.6 : 0.4, w: 9, h: 0.7,
    fontFace: HEAD, fontSize: 30, bold: true, color: C.accent, margin: 0,
  });
}

function addFooter(s, pageNum) {
  s.addText("DAMR — System Overview", {
    x: 0.5, y: 5.32, w: 5, h: 0.25,
    fontFace: BODY, fontSize: 9, color: C.textMuted, margin: 0,
  });
  s.addText(String(pageNum), {
    x: 9.2, y: 5.32, w: 0.4, h: 0.25,
    fontFace: BODY, fontSize: 9, color: C.textMuted, align: "right", margin: 0,
  });
}

// A small filled circle with a short label inside — the deck's repeated
// visual motif (used for numbered steps and section markers), no external
// icon assets required.
function addMarkerCircle(s, x, y, diameter, label, opts = {}) {
  const fill = opts.fill || C.primary;
  const textColor = opts.color || C.white;
  const fontSize = opts.fontSize || 16;
  s.addShape(pres.shapes.OVAL, {
    x, y, w: diameter, h: diameter,
    fill: { color: fill },
    line: { type: "none" },
    shadow: shadow(),
  });
  s.addText(label, {
    x, y, w: diameter, h: diameter,
    align: "center", valign: "middle",
    fontFace: BODY, fontSize, bold: true, color: textColor, margin: 0,
  });
}

function bulletList(items) {
  return items.map((t, i) => ({
    text: t,
    options: { bullet: { code: "25AA" }, breakLine: i < items.length - 1, paraSpaceAfter: 10 },
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Title
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addDarkSlide();
  s.addShape(pres.shapes.OVAL, {
    x: 7.6, y: -1.8, w: 4.5, h: 4.5,
    fill: { color: C.primary, transparency: 55 },
    line: { type: "none" },
  });
  s.addShape(pres.shapes.OVAL, {
    x: -1.6, y: 3.4, w: 3.6, h: 3.6,
    fill: { color: C.secondary, transparency: 60 },
    line: { type: "none" },
  });

  s.addText("DAMR", {
    x: 0.7, y: 1.75, w: 8.6, h: 1.2,
    fontFace: HEAD, fontSize: 60, bold: true, color: C.white, margin: 0,
  });
  s.addText("Digital Automated Meter Reading & Billing Platform", {
    x: 0.7, y: 2.85, w: 8.6, h: 0.5,
    fontFace: BODY, fontSize: 20, color: "BFE1EE", margin: 0,
  });
  s.addText("From meter to money — read, validate, bill, collect and reconcile, in one system.", {
    x: 0.7, y: 3.35, w: 8.2, h: 0.45,
    fontFace: BODY, italic: true, fontSize: 13, color: "8FB9CC", margin: 0,
  });

  s.addShape(pres.shapes.LINE, {
    x: 0.72, y: 4.35, w: 1.3, h: 0,
    line: { color: C.gold, width: 2 },
  });
  s.addText("End-to-End System Overview  |  30-Minute Engineering Briefing", {
    x: 0.7, y: 4.5, w: 8.6, h: 0.4,
    fontFace: BODY, fontSize: 13, color: C.white, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Agenda
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, null, "What We'll Cover");
  addFooter(s, 2);

  const items = [
    "Why DAMR exists",
    "Architecture & technology stack",
    "The data model — how everything connects",
    "End-to-end flow, meter to money",
    "Core modules — facilities, meters, billing",
    "The trust layer — anomaly-gated billing",
    "Payments — our own M-Pesa integration",
    "Self-service, roles & security",
    "Quality, roadmap status & next steps",
  ];

  const colH = 0.46;
  const startY = 1.35;
  items.forEach((t, i) => {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    const x = 0.6 + col * 4.6;
    const y = startY + row * colH;
    addMarkerCircle(s, x, y, 0.34, String(i + 1), { fill: i % 2 === 0 ? C.primary : C.secondary, fontSize: 13 });
    s.addText(t, {
      x: x + 0.48, y: y - 0.03, w: 3.85, h: 0.4,
      fontFace: BODY, fontSize: 14, color: C.textDark, valign: "middle", margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 3 — Why DAMR Exists
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "The Problem", "Why DAMR Exists");
  addFooter(s, 3);

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.5, w: 5.3, h: 3.6, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("Manual water billing breaks down at scale", {
    x: 0.75, y: 1.68, w: 4.8, h: 0.4,
    fontFace: HEAD, bold: true, fontSize: 15, color: C.accent, margin: 0,
  });
  s.addText(
    bulletList([
      "Meter readings captured on paper or ad-hoc — slow, error-prone, no audit trail",
      "Bad readings only surface as angry resident disputes, after the bill is sent",
      "Collection is scattered across cash, bank, and Paybill with no reconciliation",
      "Leaks and tampering go unnoticed until consumption is already extreme",
    ]),
    { x: 0.75, y: 2.15, w: 4.8, h: 2.85, fontFace: BODY, fontSize: 13, color: C.textDark, valign: "top" },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 6.1, y: 1.5, w: 3.4, h: 3.6, rectRadius: 0.08,
    fill: { color: C.primary }, line: { type: "none" }, shadow: shadow(),
  });
  s.addText("Our Vision", {
    x: 6.35, y: 1.75, w: 2.9, h: 0.35,
    fontFace: BODY, bold: true, fontSize: 13, color: C.gold, charSpacing: 1, margin: 0,
  });
  s.addText("One platform that captures, validates, bills, collects and reconciles — automatically.", {
    x: 6.35, y: 2.15, w: 2.9, h: 1.6,
    fontFace: HEAD, fontSize: 17, color: C.white, margin: 0,
  });
  s.addText("No spreadsheets. No manual reconciliation. No surprise bills.", {
    x: 6.35, y: 4.15, w: 2.9, h: 0.8,
    fontFace: BODY, italic: true, fontSize: 11.5, color: "BFE1EE", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 4 — Tech Stack
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Foundations", "Built On");
  addFooter(s, 4);

  const cardY = 1.4, cardH = 2.55;
  // Frontend card
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: cardY, w: 4.3, h: cardH, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  addMarkerCircle(s, 0.75, cardY + 0.25, 0.42, "FE", { fill: C.secondary, fontSize: 13 });
  s.addText("Frontend", { x: 1.3, y: cardY + 0.28, w: 3.3, h: 0.36, fontFace: HEAD, bold: true, fontSize: 16, color: C.accent, valign: "middle", margin: 0 });
  s.addText(
    bulletList(["React 18 single-page app", "Redux Toolkit for state", "PrimeReact + Bootstrap UI", "Chart.js for dashboards", "React Router (SPA + public pages)"]),
    { x: 0.8, y: cardY + 0.85, w: 3.7, h: 1.6, fontFace: BODY, fontSize: 12.5, color: C.textDark },
  );

  // Backend card
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.2, y: cardY, w: 4.3, h: cardH, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  addMarkerCircle(s, 5.45, cardY + 0.25, 0.42, "BE", { fill: C.primary, fontSize: 13 });
  s.addText("Backend", { x: 6.0, y: cardY + 0.28, w: 3.3, h: 0.36, fontFace: HEAD, bold: true, fontSize: 16, color: C.accent, valign: "middle", margin: 0 });
  s.addText(
    bulletList(["Node.js + Express REST API", "MongoDB + Mongoose ODM", "JWT authentication", "node-cron scheduled jobs", "Jest test suite (in-memory Mongo)"]),
    { x: 5.5, y: cardY + 0.85, w: 3.7, h: 1.6, fontFace: BODY, fontSize: 12.5, color: C.textDark },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 4.15, w: 9, h: 0.55, rectRadius: 0.08,
    fill: { color: C.accent }, line: { type: "none" },
  });
  s.addText([
    { text: "Integrations:  ", options: { bold: true, color: C.gold } },
    { text: "Google Vision (meter OCR)   •   Safaricom Daraja (M-Pesa)   •   Email / SMS / WhatsApp", options: { color: C.white } },
  ], { x: 0.7, y: 4.15, w: 8.6, h: 0.55, fontFace: BODY, fontSize: 12.5, valign: "middle", margin: 0 });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 5 — System Architecture
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "How It's Built", "System Architecture");
  addFooter(s, 5);

  const boxY = 1.55, boxH = 0.95, boxW = 2.5;
  const boxes = [
    { x: 0.5, label: "React SPA", sub: "Browser" },
    { x: 3.75, label: "Express REST API", sub: "Node.js backend" },
    { x: 7.0, label: "MongoDB", sub: "Mongoose models" },
  ];
  boxes.forEach((b) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: b.x, y: boxY, w: boxW, h: boxH, rectRadius: 0.08,
      fill: { color: C.primary }, line: { type: "none" }, shadow: shadow(),
    });
    s.addText(b.label, { x: b.x, y: boxY + 0.15, w: boxW, h: 0.4, align: "center", fontFace: HEAD, bold: true, fontSize: 15, color: C.white, margin: 0 });
    s.addText(b.sub, { x: b.x, y: boxY + 0.55, w: boxW, h: 0.3, align: "center", fontFace: BODY, fontSize: 11, color: "BFE1EE", margin: 0 });
  });
  // Arrows between the three boxes
  [0.5 + boxW, 3.75 + boxW].forEach((ax) => {
    s.addShape(pres.shapes.LINE, {
      x: ax, y: boxY + boxH / 2, w: 3.75 - (ax - 0.5) - 2.5 + (ax === 0.5 + boxW ? 0.75 : 0.75), h: 0,
      line: { color: C.secondary, width: 2, endArrowType: "triangle" },
    });
  });

  // External services row
  const extY = 3.4;
  s.addText("External services the API talks to:", {
    x: 0.5, y: extY - 0.35, w: 8, h: 0.3, fontFace: BODY, italic: true, fontSize: 12, color: C.textMuted, margin: 0,
  });
  const ext = [
    { x: 0.5, label: "Google Vision", sub: "Meter photo OCR" },
    { x: 3.75, label: "Safaricom Daraja", sub: "STK Push + C2B (M-Pesa)" },
    { x: 7.0, label: "Comms Providers", sub: "Email • SMS • WhatsApp" },
  ];
  ext.forEach((b) => {
    s.addShape(pres.shapes.LINE, {
      x: b.x + boxW / 2, y: boxY + boxH, w: 0, h: extY - (boxY + boxH),
      line: { color: C.line, width: 1.5, dashType: "dash" },
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: b.x, y: extY, w: boxW, h: 0.85, rectRadius: 0.08,
      fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
    });
    s.addText(b.label, { x: b.x, y: extY + 0.1, w: boxW, h: 0.35, align: "center", fontFace: BODY, bold: true, fontSize: 13, color: C.accent, margin: 0 });
    s.addText(b.sub, { x: b.x, y: extY + 0.46, w: boxW, h: 0.3, align: "center", fontFace: BODY, fontSize: 10.5, color: C.textMuted, margin: 0 });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 6 — Data Hierarchy
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "The Data Model", "How Everything Connects");
  addFooter(s, 6);

  function node(x, y, w, label, sub, fill) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y, w, h: 0.62, rectRadius: 0.06,
      fill: { color: fill }, line: { type: "none" }, shadow: shadow(),
    });
    s.addText(label, { x, y: y + 0.04, w, h: 0.32, align: "center", fontFace: BODY, bold: true, fontSize: 12.5, color: C.white, margin: 0 });
    if (sub) s.addText(sub, { x, y: y + 0.34, w, h: 0.24, align: "center", fontFace: BODY, fontSize: 9, color: "D9EEF5", margin: 0 });
  }
  function arrow(x1, y1, x2, y2) {
    s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: C.secondary, width: 2, endArrowType: "triangle" } });
  }

  const rowY1 = 1.45, rowY2 = 2.35, w1 = 1.7, gap = 0.35;
  const xs = [0.5, 0.5 + w1 + gap, 0.5 + 2 * (w1 + gap), 0.5 + 3 * (w1 + gap), 0.5 + 4 * (w1 + gap)];
  const labels1 = [["Facility", null], ["Complex", "Block/Court/Tower"], ["Floor", null], ["Unit", null], ["Resident", null]];
  labels1.forEach((l, i) => node(xs[i], rowY1, w1, l[0], l[1], i % 2 === 0 ? C.primary : C.secondary));
  for (let i = 0; i < labels1.length - 1; i++) arrow(xs[i] + w1, rowY1 + 0.31, xs[i + 1], rowY1 + 0.31);

  s.addText("A resident's Unit is the hinge — it also anchors the billing chain below:", {
    x: 0.5, y: 3.15, w: 9, h: 0.3, fontFace: BODY, italic: true, fontSize: 11.5, color: C.textMuted, margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: xs[3] + w1 / 2, y: rowY1 + 0.62, w: 0, h: (rowY2 + 1.05) - (rowY1 + 0.62),
    line: { color: C.line, width: 1.5, dashType: "dash" },
  });

  const rowY3 = 3.6;
  const labels2 = [["Meter", null], ["Reading", "OCR / manual"], ["Invoice", "Billed amount"], ["Payment", "M-Pesa / cash"]];
  const w2 = 2.05, gap2 = 0.3;
  const xs2 = [0.9, 0.9 + w2 + gap2, 0.9 + 2 * (w2 + gap2), 0.9 + 3 * (w2 + gap2)];
  labels2.forEach((l, i) => node(xs2[i], rowY3, w2, l[0], l[1], C.accent));
  for (let i = 0; i < labels2.length - 1; i++) arrow(xs2[i] + w2, rowY3 + 0.31, xs2[i + 1], rowY3 + 0.31);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 7 — End-to-End Flow
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Meter to Money", "The End-to-End Flow");
  addFooter(s, 7);

  const steps = [
    ["Capture Reading", "OCR photo or manual entry"],
    ["Anomaly Scan", "Every reading checked live"],
    ["Monthly Billing", "Tiered charges calculated"],
    ["Invoice + Notify", "Email / SMS / WhatsApp"],
    ["Resident Pays", "STK Push or Paybill"],
    ["Auto-Reconcile", "Invoice marked Paid"],
  ];

  const cols = 3, rows = 2;
  const cardW = 2.85, cardH = 1.55, gapX = 0.25, gapY = 0.35;
  const startX = 0.5, startY = 1.5;

  steps.forEach((st, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y, w: cardW, h: cardH, rectRadius: 0.08,
      fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
    });
    addMarkerCircle(s, x + 0.2, y + 0.2, 0.5, String(i + 1), { fill: C.gold, color: C.accent, fontSize: 18 });
    s.addText(st[0], { x: x + 0.85, y: y + 0.2, w: cardW - 1.0, h: 0.5, fontFace: HEAD, bold: true, fontSize: 14, color: C.accent, valign: "middle", margin: 0 });
    s.addText(st[1], { x: x + 0.2, y: y + 0.85, w: cardW - 0.4, h: 0.6, fontFace: BODY, fontSize: 11.5, color: C.textDark, margin: 0 });

    if (col < cols - 1) {
      s.addShape(pres.shapes.LINE, {
        x: x + cardW, y: y + cardH / 2, w: gapX, h: 0,
        line: { color: C.secondary, width: 2, endArrowType: "triangle" },
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 8 — Module: Facility & Hierarchy Management
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 01", "Facility & Hierarchy Management");
  addFooter(s, 8);

  const rows = [
    ["Flexible structure", "Facility → Complex (Block/Court/Tower/Wing) → Floor → Unit — or skip straight to Unit for a flat facility"],
    ["Mixed terminology, per facility", "One facility can mix a Block, a Court, and a Tower side by side — each keeps its own type"],
    ["AI-assisted naming", "Gemini turns “northern & southern wing” into named records; deterministic fallback when AI is off"],
    ["Scoped tariff plans", "Pricing can be set per facility, per block, or per unit category — most specific plan always wins"],
  ];
  let y = 1.45;
  rows.forEach((r, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y, w: 9, h: 0.88, rectRadius: 0.06,
      fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
    });
    addMarkerCircle(s, 0.7, y + 0.22, 0.42, String(i + 1), { fill: C.primary, fontSize: 14 });
    s.addText(r[0], { x: 1.3, y: y + 0.1, w: 3.0, h: 0.68, fontFace: HEAD, bold: true, fontSize: 13.5, color: C.accent, valign: "middle", margin: 0 });
    s.addText(r[1], { x: 4.35, y: y + 0.1, w: 4.9, h: 0.68, fontFace: BODY, fontSize: 12, color: C.textDark, valign: "middle", margin: 0 });
    y += 1.0;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 9 — Module: Meters, Readings & OCR
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 02", "Meters, Readings & OCR");
  addFooter(s, 9);

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.45, w: 5.6, h: 3.65, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("Capturing a reading", { x: 0.75, y: 1.65, w: 5.1, h: 0.4, fontFace: HEAD, bold: true, fontSize: 15, color: C.accent, margin: 0 });
  s.addText(
    bulletList([
      "Field staff photograph the meter — Google Vision OCR extracts the digits automatically",
      "Manual entry available as a fallback",
      "Same-day duplicate submissions are flagged for review, never silently accepted",
      "Every reading is checked for statistical anomalies the moment it's saved",
    ]),
    { x: 0.75, y: 2.1, w: 5.1, h: 2.9, fontFace: BODY, fontSize: 12.5, color: C.textDark },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 6.3, y: 1.45, w: 3.2, h: 3.65, rectRadius: 0.08,
    fill: { color: C.secondary }, line: { type: "none" }, shadow: shadow(),
  });
  s.addText("Also tracked", { x: 6.55, y: 1.65, w: 2.7, h: 0.35, fontFace: BODY, bold: true, fontSize: 12.5, color: C.gold, charSpacing: 1, margin: 0 });
  s.addText(
    bulletList(["Meter assignment history per unit", "Bulk / supplier meters", "Non-Revenue Water (NRW) reporting", "Consumption trend reports"]),
    { x: 6.55, y: 2.1, w: 2.7, h: 2.9, fontFace: BODY, fontSize: 12, color: C.white },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 10 — Module: Billing Engine
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 03", "The Billing Engine");
  addFooter(s, 10);

  s.addText(
    bulletList([
      "Tiered consumption bands — rate increases the more a unit consumes",
      "Sewerage charge (% of water) + fixed tech fee + minimum charge floor",
      "Unpaid arrears carry forward automatically onto the next bill",
      "Open credits applied oldest-first before the balance is finalized",
      "Configurable late-payment penalties (flat or percentage)",
    ]),
    { x: 0.5, y: 1.45, w: 4.6, h: 3.6, fontFace: BODY, fontSize: 13, color: C.textDark },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.3, y: 1.45, w: 4.2, h: 3.65, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("Example: tiered rate per m³", {
    x: 5.5, y: 1.6, w: 3.8, h: 0.35, fontFace: BODY, bold: true, fontSize: 12.5, color: C.accent, margin: 0,
  });
  s.addChart(
    pres.charts.BAR,
    [{ name: "Rate (KES/m³)", labels: ["0–6 m³", "6–20 m³", "20+ m³"], values: [80, 130, 180] }],
    {
      x: 5.4, y: 2.0, w: 4.0, h: 2.9, barDir: "col",
      chartColors: [C.primary],
      chartArea: { fill: { color: "FFFFFF" } },
      catAxisLabelColor: C.textMuted, valAxisLabelColor: C.textMuted,
      valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
      showValue: true, dataLabelPosition: "outEnd", dataLabelColor: C.textDark,
      showLegend: false, showTitle: false,
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 11 — Intelligence Layer: Anomaly-Gated Billing
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 04 — The Trust Layer", "Anomaly-Gated Billing");
  addFooter(s, 11);

  s.addText(
    [{ text: "Every reading is statistically checked before it becomes a bill — spikes, drops, zero-flow, overnight leaks, and critical outliers are all detected automatically.", options: {} }],
    { x: 0.5, y: 1.4, w: 9, h: 0.7, fontFace: BODY, fontSize: 13.5, color: C.textDark },
  );

  const colW = 4.35, colY = 2.25, colH = 2.85;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: colY, w: colW, h: colH, rectRadius: 0.08,
    fill: { color: "FBEAEA" }, line: { color: "F0C4C4", width: 1 },
  });
  s.addText("Before", { x: 0.75, y: colY + 0.18, w: 3.8, h: 0.35, fontFace: HEAD, bold: true, fontSize: 14, color: C.danger, margin: 0 });
  s.addText(
    bulletList(["A flagged reading still got billed", "Resident receives a possibly-wrong invoice", "Trust damaged before anyone reviews it"]),
    { x: 0.75, y: colY + 0.65, w: 3.85, h: 2.0, fontFace: BODY, fontSize: 12.5, color: C.textDark },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.15, y: colY, w: colW, h: colH, rectRadius: 0.08,
    fill: { color: "E8F6F0" }, line: { color: C.green, width: 1 },
  });
  s.addText("Now", { x: 5.4, y: colY + 0.18, w: 3.8, h: 0.35, fontFace: HEAD, bold: true, fontSize: 14, color: C.green, margin: 0 });
  s.addText(
    bulletList(["High-severity flags HOLD the invoice", "Resident is never notified while under review", "Resolving the flag auto-releases + sends the first bill notice"]),
    { x: 5.4, y: colY + 0.65, w: 3.85, h: 2.0, fontFace: BODY, fontSize: 12.5, color: C.textDark },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 12 — Payments: Native M-Pesa Integration
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 05", "Payments — Our Own M-Pesa Integration");
  addFooter(s, 12);

  s.addText([
    { text: "DAMR talks to Safaricom's Daraja API directly. ", options: { bold: true, color: C.accent } },
    { text: "No third-party payments microservice sits in between.", options: { color: C.textDark } },
  ], { x: 0.5, y: 1.35, w: 9, h: 0.4, fontFace: BODY, fontSize: 13.5, margin: 0 });

  const colW = 4.35, colY = 1.9, colH = 3.2;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: colY, w: colW, h: colH, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("A) STK Push — “Pay Now”", { x: 0.75, y: colY + 0.2, w: 3.85, h: 0.4, fontFace: HEAD, bold: true, fontSize: 14, color: C.green, margin: 0 });
  s.addText(
    bulletList(["Staff or resident taps Pay Now", "Safaricom prompts the phone directly", "Callback applies the payment instantly", "No polling — status pushed to the app"]),
    { x: 0.75, y: colY + 0.7, w: 3.85, h: 2.4, fontFace: BODY, fontSize: 12, color: C.textDark },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.15, y: colY, w: colW, h: colH, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("B) Paybill — Top Up Anytime", { x: 5.4, y: colY + 0.2, w: 3.85, h: 0.4, fontFace: HEAD, bold: true, fontSize: 14, color: C.green, margin: 0 });
  s.addText(
    bulletList(["Resident pays into their own Paybill account", "Safaricom's confirmation webhook lands the receipt", "Auto-reconciled against open invoices", "Cash payments recorded the same way"]),
    { x: 5.4, y: colY + 0.7, w: 3.85, h: 2.4, fontFace: BODY, fontSize: 12, color: C.textDark },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 13 — Resident Self-Service
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 06", "Resident Self-Service");
  addFooter(s, 13);

  const items = [
    ["No-login bill link", "Every invoice ships with a tokenized, no-password link — view and pay instantly"],
    ["Full statement of account", "One resident-level link shows every bill, every payment, and the running balance"],
    ["Multi-channel delivery", "Every notice goes out by Email, SMS, and WhatsApp — whichever the resident has on file"],
    ["Optional resident portal", "Residents who do log in see their readings and bill history directly"],
  ];
  let y = 1.45;
  items.forEach((r, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y, w: 9, h: 0.88, rectRadius: 0.06,
      fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
    });
    addMarkerCircle(s, 0.7, y + 0.22, 0.42, String(i + 1), { fill: C.secondary, fontSize: 14 });
    s.addText(r[0], { x: 1.3, y: y + 0.1, w: 2.9, h: 0.68, fontFace: HEAD, bold: true, fontSize: 13.5, color: C.accent, valign: "middle", margin: 0 });
    s.addText(r[1], { x: 4.25, y: y + 0.1, w: 5.0, h: 0.68, fontFace: BODY, fontSize: 12, color: C.textDark, valign: "middle", margin: 0 });
    y += 1.0;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 14 — Roles & Security
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 07", "Roles & Security");
  addFooter(s, 14);

  const roleRows = [
    [{ text: "Role", options: { bold: true, color: C.white, fill: { color: C.primary } } },
     { text: "Access", options: { bold: true, color: C.white, fill: { color: C.primary } } }],
    ["Admin", "Full access across every facility"],
    ["Facility Manager (editor)", "Scoped to their own facility only — enforced on every fetch, not just lists"],
    ["Field Staff", "Meters and readings only — no billing or payment access"],
    ["Resident", "Their own bills only, via tokenized link or portal login"],
  ];
  s.addTable(roleRows, {
    x: 0.5, y: 1.5, w: 9, colW: [3.2, 5.8],
    border: { pt: 0.5, color: C.line },
    fontFace: BODY, fontSize: 12.5, color: C.textDark,
    autoPage: false,
    rowH: 0.58,
  });

  s.addText("JWT-based authentication, with a facility-mismatch guard applied consistently across every single-record endpoint — not just list views.", {
    x: 0.5, y: 4.85, w: 9, h: 0.5, fontFace: BODY, italic: true, fontSize: 12, color: C.textMuted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 15 — Automation: Scheduled Jobs
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Module 08", "Automation — Scheduled Jobs");
  addFooter(s, 15);

  const rows = [
    [{ text: "Job", options: { bold: true, color: C.white, fill: { color: C.primary } } },
     { text: "Schedule", options: { bold: true, color: C.white, fill: { color: C.primary } } },
     { text: "Purpose", options: { bold: true, color: C.white, fill: { color: C.primary } } }],
    ["Monthly Invoicing", "1st of month", "Generate every bill for the period, notify residents"],
    ["Upcoming / Overdue Reminders", "Daily", "Nudge before the due date, keep nagging after it"],
    ["Daily Anomaly Scan", "Daily", "Catch missing readings, re-check pending ones"],
    ["Auto-Reconcile Payments", "Every 15 minutes", "Sweep for any unclaimed M-Pesa or cash receipt"],
  ];
  s.addTable(rows, {
    x: 0.5, y: 1.5, w: 9, colW: [3.1, 2.0, 3.9],
    border: { pt: 0.5, color: C.line },
    fontFace: BODY, fontSize: 12, color: C.textDark,
    autoPage: false,
    rowH: 0.62,
  });

  s.addText("Every job also has a manual “Run Now” trigger for staff testing and verification, without waiting on the clock.", {
    x: 0.5, y: 4.85, w: 9, h: 0.5, fontFace: BODY, italic: true, fontSize: 12, color: C.textMuted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 16 — Standing Alone: The Independence Migration
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addDarkSlide();
  s.addText("STANDING ALONE", {
    x: 0.5, y: 0.35, w: 9, h: 0.3, fontFace: BODY, bold: true, fontSize: 12, color: C.gold, charSpacing: 2, margin: 0,
  });
  s.addText("DAMR No Longer Depends on Any External Platform", {
    x: 0.5, y: 0.65, w: 9, h: 0.7, fontFace: HEAD, bold: true, fontSize: 26, color: C.white, margin: 0,
  });

  const colW = 4.35, colY = 1.65, colH = 3.5;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: colY, w: colW, h: colH, rectRadius: 0.08,
    fill: { color: "1A3A56" }, line: { type: "none" },
  });
  s.addText("Before", { x: 0.75, y: colY + 0.2, w: 3.85, h: 0.35, fontFace: HEAD, bold: true, fontSize: 15, color: "F2A541", margin: 0 });
  s.addText(
    bulletList(["Core data models borrowed from an external package", "M-Pesa handled by a shared third-party microservice", "Uptime and roadmap tied to someone else's platform"]),
    { x: 0.75, y: colY + 0.7, w: 3.85, h: 2.7, fontFace: BODY, fontSize: 13, color: C.white },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.15, y: colY, w: colW, h: colH, rectRadius: 0.08,
    fill: { color: C.green }, line: { type: "none" },
  });
  s.addText("Now", { x: 5.4, y: colY + 0.2, w: 3.85, h: 0.35, fontFace: HEAD, bold: true, fontSize: 15, color: C.white, margin: 0 });
  s.addText(
    bulletList(["DAMR owns User, Facility, Unit and Resident models natively", "Direct Safaricom Daraja integration — STK Push and Paybill both", "Zero data migration required — same collections, new ownership"]),
    { x: 5.4, y: colY + 0.7, w: 3.85, h: 2.7, fontFace: BODY, fontSize: 13, color: C.white },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 17 — Quality & Roadmap Status
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Proof It Works", "Quality & Roadmap Status");
  addFooter(s, 17);

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.45, w: 4.3, h: 3.6, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("Automated Test Suite", { x: 0.75, y: 1.65, w: 3.8, h: 0.35, fontFace: HEAD, bold: true, fontSize: 14.5, color: C.accent, margin: 0 });
  s.addText("64+", { x: 0.75, y: 2.05, w: 3.8, h: 0.9, fontFace: HEAD, bold: true, fontSize: 60, color: C.primary, margin: 0 });
  s.addText("tests across 11 suites — all passing", { x: 0.75, y: 2.85, w: 3.8, h: 0.35, fontFace: BODY, fontSize: 12.5, color: C.textDark, margin: 0 });
  s.addText(
    bulletList(["In-memory MongoDB — no shared test data", "External services (M-Pesa, email/SMS) fully mocked", "Covers billing math, reconciliation, anomaly gating"]),
    { x: 0.75, y: 3.35, w: 3.8, h: 1.6, fontFace: BODY, fontSize: 11.5, color: C.textDark },
  );

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.2, y: 1.45, w: 4.3, h: 3.6, rectRadius: 0.08,
    fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
  });
  s.addText("Phase 8 Gap-Closure Roadmap", { x: 5.45, y: 1.65, w: 3.8, h: 0.35, fontFace: HEAD, bold: true, fontSize: 14.5, color: C.accent, margin: 0 });
  s.addText("6 / 6", { x: 5.45, y: 2.05, w: 3.8, h: 0.9, fontFace: HEAD, bold: true, fontSize: 60, color: C.green, margin: 0 });
  s.addText("proposal gaps closed", { x: 5.45, y: 2.85, w: 3.8, h: 0.35, fontFace: BODY, fontSize: 12.5, color: C.textDark, margin: 0 });
  s.addText(
    bulletList(["Anomaly-gated billing", "Automatic payment reconciliation", "Resident statement of account", "Per-block tariff plans, AI validation status, block/floor hierarchy"]),
    { x: 5.45, y: 3.35, w: 3.8, h: 1.6, fontFace: BODY, fontSize: 11.5, color: C.textDark },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 18 — What's Next
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addLightSlide();
  addHeader(s, "Looking Ahead", "What's Next");
  addFooter(s, 18);

  const items = [
    ["Verify the live Safaricom handshake", "STK Push and C2B work end-to-end in code and tests; the final live sandbox call is pending a network fix (a WAF block on the current dev network, not an app issue)"],
    ["Register C2B per facility", "Turn on direct webhook delivery for each facility's Paybill once the sandbox check clears"],
    ["Routine housekeeping", "Dependency cleanup left over from the platform-independence migration"],
    ["Open for new priorities", "Foundation is stable — ready for the next roadmap set from the team"],
  ];
  let y = 1.45;
  items.forEach((r, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y, w: 9, h: 0.88, rectRadius: 0.06,
      fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow(),
    });
    addMarkerCircle(s, 0.7, y + 0.22, 0.42, String(i + 1), { fill: C.gold, color: C.accent, fontSize: 14 });
    s.addText(r[0], { x: 1.3, y: y + 0.1, w: 3.0, h: 0.68, fontFace: HEAD, bold: true, fontSize: 13, color: C.accent, valign: "middle", margin: 0 });
    s.addText(r[1], { x: 4.35, y: y + 0.08, w: 4.9, h: 0.72, fontFace: BODY, fontSize: 11, color: C.textDark, valign: "middle", margin: 0 });
    y += 1.0;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 19 — Thank You / Questions
// ─────────────────────────────────────────────────────────────────────────
{
  const s = addDarkSlide();
  s.addShape(pres.shapes.OVAL, {
    x: -1.5, y: -1.5, w: 4, h: 4,
    fill: { color: C.primary, transparency: 55 }, line: { type: "none" },
  });
  s.addShape(pres.shapes.OVAL, {
    x: 7.8, y: 2.5, w: 3.6, h: 3.6,
    fill: { color: C.secondary, transparency: 60 }, line: { type: "none" },
  });
  s.addText("Questions?", {
    x: 0.7, y: 2.1, w: 8.6, h: 1.0, fontFace: HEAD, bold: true, fontSize: 48, color: C.white, margin: 0,
  });
  s.addText("DAMR — Digital Automated Meter Reading & Billing Platform", {
    x: 0.7, y: 3.05, w: 8.6, h: 0.4, fontFace: BODY, fontSize: 15, color: "BFE1EE", margin: 0,
  });
  s.addShape(pres.shapes.LINE, { x: 0.72, y: 3.75, w: 1.3, h: 0, line: { color: C.gold, width: 2 } });
  s.addText("Thank you for your time.", {
    x: 0.7, y: 3.9, w: 8.6, h: 0.4, fontFace: BODY, italic: true, fontSize: 13, color: C.white, margin: 0,
  });
}

// ── Speaker notes (added last, matched to slide order via pres.slides) ──
const notes = [
  "Welcome everyone. Today I'm walking through DAMR end to end -- architecture, data model, every feature module, and where we stand on testing and the roadmap. Should take about 30 minutes with room for questions.",
  "Quick roadmap for the next half hour -- we'll go from the business problem, through architecture, the data model, the full meter-to-money flow, each feature module, and close with quality and what's next.",
  "Before DAMR, meter reading and billing were manual and disconnected -- slow, error prone, no audit trail, and payment collection had no reconciliation. DAMR's vision is one platform that automates the whole chain.",
  "Standard, boring-on-purpose stack -- React/Redux on the frontend, Node/Express/MongoDB on the backend. The interesting integrations are Google Vision for OCR and Safaricom Daraja for M-Pesa, both of which we'll cover in detail.",
  "Classic three-tier setup. The API is the single source of truth and it's the only thing that talks to MongoDB or any external service -- the frontend never calls Safaricom or Google directly.",
  "This is the backbone of the whole system. Facilities contain an optional Block/Court/Tower/Floor hierarchy down to a Unit, and a Unit is where a Resident, a Meter, and ultimately an Invoice all connect.",
  "This is the story of one bill, start to finish -- a reading comes in, gets checked for anomalies, gets billed monthly, the resident is notified, they pay via M-Pesa, and the system reconciles it automatically. Every slide after this zooms into one of these six steps.",
  "Facilities aren't one-size-fits-all -- a single facility can mix Blocks, Courts and a Tower, each named by an AI assist with a deterministic fallback, and each can have its own tariff plan scoped down to a specific unit category.",
  "Field staff capture readings by photo -- Google Vision OCR reads the digits -- or manually as a fallback. Every reading is also checked live for duplicates and anomalies the moment it's saved.",
  "This is the actual math -- tiered consumption bands, sewerage percentage, a flat tech fee, a minimum charge floor, automatic arrears carry-forward, credits applied oldest first, and configurable late penalties.",
  "This is the trust layer I'm most proud of. Before, a flagged reading still got billed and the resident received a possibly-wrong invoice. Now, high-severity flags -- spikes, overnight leaks, critical outliers -- hold the invoice entirely until a human reviews it, and only then does the resident get notified.",
  "This is the newest major piece of work -- DAMR now talks to Safaricom directly, no third-party payments service in between. Two paths: a push prompt for pay-now, and a pull-style Paybill top-up reconciled via Safaricom's own webhook.",
  "Residents get a no-login link on every bill, plus a brand new resident-level statement link showing their entire payment history and running balance -- all delivered automatically over email, SMS and WhatsApp.",
  "Four roles, cleanly separated -- Admin sees everything, Facility Managers are scoped strictly to their own facility, Field Staff only touch meters and readings, and Residents only ever see their own bills.",
  "Nothing in DAMR waits on a person to remember to run it -- invoicing, reminders, anomaly scans and payment reconciliation are all on a schedule, with a manual run-now option for testing.",
  "This is a milestone worth calling out -- DAMR used to depend on an external package for its core data models and a shared microservice for M-Pesa. Both are now owned natively, with zero data migration needed.",
  "Proof this all actually works -- 64-plus automated tests across 11 suites, all passing, and every one of the six gaps identified against the original proposal has been closed.",
  "Being transparent about what's left -- the M-Pesa integration is fully built and tested, but the very last step, a live handshake against Safaricom's sandbox, is currently blocked by a network firewall on our dev machine, not a code issue. That's the main open item.",
  "That's the full picture end to end. Happy to take questions, or dive deeper into any module.",
];

pres.slides.forEach((slide, i) => {
  if (notes[i]) slide.addNotes(notes[i]);
});

pres.writeFile({ fileName: "DAMR - End-to-End System Overview.pptx" }).then(() => {
  console.log("Done: DAMR - End-to-End System Overview.pptx");
});
