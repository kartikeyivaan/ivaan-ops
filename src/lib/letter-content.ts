export const LETTERHEAD_COMPANY_CODES = ["ISE", "PCMV"] as const;
export type LetterheadCompanyCode = (typeof LETTERHEAD_COMPANY_CODES)[number];

export const DEFAULT_LETTER_SIGNATORIES: Record<
  LetterheadCompanyCode,
  { name: string; designation: string; printOffsetMm: number }
> = {
  ISE: { name: "Harshal Patil", designation: "Partner", printOffsetMm: 65 },
  PCMV: { name: "Kartikey Mahajan", designation: "Partner", printOffsetMm: 60 },
};

export const IMAGE_DATA_URL_MAX = 400_000;
export const LETTER_CONTENT_MAX = 200_000;

const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
]);
const ALIGN_VALUES = new Set(["left", "center", "right", "justify"]);

export function isLetterheadCompanyCode(code: string): code is LetterheadCompanyCode {
  return LETTERHEAD_COMPANY_CODES.includes(code as LetterheadCompanyCode);
}

export function isOperationalLetterCompany(company: {
  code: string;
  isPractice?: boolean | null;
  isActive?: boolean | null;
}): boolean {
  return (
    isLetterheadCompanyCode(company.code) &&
    !company.isPractice &&
    company.isActive !== false
  );
}

export function defaultSignatoryForCode(code: string): {
  name: string;
  designation: string;
  printOffsetMm: number;
} {
  if (isLetterheadCompanyCode(code)) return DEFAULT_LETTER_SIGNATORIES[code];
  return DEFAULT_LETTER_SIGNATORIES.ISE;
}

export function isImageDataUrl(value: string): boolean {
  return IMAGE_DATA_URL_PATTERN.test(value.trim());
}

export function letterHtmlHasText(html: string): boolean {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length > 0;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTextAlign(attrs: string): string | undefined {
  const styleMatch = attrs.match(/text-align\s*:\s*(left|center|right|justify)/i);
  if (styleMatch && ALIGN_VALUES.has(styleMatch[1]!.toLowerCase())) {
    return styleMatch[1]!.toLowerCase();
  }
  const alignMatch = attrs.match(/\balign\s*=\s*["']?(left|center|right|justify)/i);
  if (alignMatch && ALIGN_VALUES.has(alignMatch[1]!.toLowerCase())) {
    return alignMatch[1]!.toLowerCase();
  }
  return undefined;
}

function parseTableSpan(attrs: string, name: "colspan" | "rowspan"): number | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`, "i"));
  if (!match) return undefined;
  const value = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(value) || value < 2 || value > 20) return undefined;
  return value;
}

function openTableCellTag(tag: "td" | "th", attrs: string): string {
  const parts: string[] = [];
  const colspan = parseTableSpan(attrs, "colspan");
  const rowspan = parseTableSpan(attrs, "rowspan");
  if (colspan) parts.push(`colspan="${colspan}"`);
  if (rowspan) parts.push(`rowspan="${rowspan}"`);
  const align = parseTextAlign(attrs);
  if (align) parts.push(`style="text-align:${align}"`);
  return parts.length ? `<${tag} ${parts.join(" ")}>` : `<${tag}>`;
}

function readStyleDeclarations(attrs: string): Record<string, string> {
  const styleMatch = attrs.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  if (!styleMatch) return {};
  const out: Record<string, string> = {};
  for (const part of styleMatch[1]!.split(";")) {
    const [rawProp, ...rest] = part.split(":");
    if (!rawProp || rest.length === 0) continue;
    const prop = rawProp.trim().toLowerCase();
    const value = rest.join(":").trim().toLowerCase();
    if (prop && value) out[prop] = value;
  }
  return out;
}

function cssLengthToPt(value: string): number | undefined {
  const match = value.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem)?$/i);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount < 0 || amount > 120) return undefined;
  const unit = (match[2] ?? "px").toLowerCase();
  if (unit === "pt") return amount;
  if (unit === "em" || unit === "rem") return amount * 11;
  return amount * 0.75;
}

function sanitizeBlockStyle(attrs: string): string | undefined {
  const styles = readStyleDeclarations(attrs);
  const parts: string[] = [];
  const align = parseTextAlign(attrs);
  if (align) parts.push(`text-align:${align}`);
  for (const prop of ["margin-top", "margin-bottom", "padding-left", "font-size"] as const) {
    const raw = styles[prop];
    if (!raw) continue;
    const pt = cssLengthToPt(raw);
    if (pt === undefined) continue;
    parts.push(`${prop}:${pt}pt`);
  }
  const lineHeight = styles["line-height"];
  if (lineHeight) {
    if (lineHeight === "normal") parts.push("line-height:normal");
    else if (/^\d+(\.\d+)?$/.test(lineHeight)) {
      const value = Number.parseFloat(lineHeight);
      if (value >= 1 && value <= 3) parts.push(`line-height:${value}`);
    }
  }
  return parts.length ? parts.join(";") : undefined;
}

function openDocGenFieldSpan(attrs: string): string | null {
  const fieldId = attrs.match(/\bdata-doc-gen-field\s*=\s*["']([0-9a-f-]{36})["']/i)?.[1];
  const fieldKey = attrs.match(/\bdata-doc-gen-key\s*=\s*["']([A-Z][A-Za-z0-9_]*)["']/i)?.[1];
  if (!fieldId || !fieldKey) return null;
  return `<span contenteditable="false" data-doc-gen-field="${fieldId}" data-doc-gen-key="${fieldKey}">`;
}

export function sanitizeLetterHtml(html: string): string {
  const withoutJunk = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|xml|head|meta|link|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?[a-zA-Z][\w.-]*:[^>]*>/g, "");
  return withoutJunk.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = match.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "td" || tag === "th") return openTableCellTag(tag, attrs);
    if (tag === "span") {
      return openDocGenFieldSpan(attrs) ?? "<span>";
    }
    if (tag === "p" || tag === "div" || tag === "li") {
      const style = sanitizeBlockStyle(attrs);
      return style ? `<${tag} style="${style}">` : `<${tag}>`;
    }
    return `<${tag}>`;
  });
}

export type LetterInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type LetterTableCell = {
  header?: boolean;
  align?: string;
  colspan?: number;
  rowspan?: number;
  children: LetterInline[];
};

export type LetterParagraphStyle = {
  align?: string;
  marginTopPt?: number;
  marginBottomPt?: number;
  paddingLeftPt?: number;
  fontSize?: number;
  lineHeight?: number;
};

export type LetterBlock =
  | ({ type: "p"; children: LetterInline[] } & LetterParagraphStyle)
  | { type: "ul"; items: LetterInline[][] }
  | { type: "ol"; items: LetterInline[][] }
  | { type: "table"; rows: LetterTableCell[][] };

function parseParagraphStyle(attrs: string): LetterParagraphStyle {
  const styles = readStyleDeclarations(attrs);
  const style: LetterParagraphStyle = { align: parseTextAlign(attrs) };
  const marginTop = styles["margin-top"] ? cssLengthToPt(styles["margin-top"]) : undefined;
  const marginBottom = styles["margin-bottom"] ? cssLengthToPt(styles["margin-bottom"]) : undefined;
  const paddingLeft = styles["padding-left"] ? cssLengthToPt(styles["padding-left"]) : undefined;
  const fontSize = styles["font-size"] ? cssLengthToPt(styles["font-size"]) : undefined;
  if (marginTop !== undefined) style.marginTopPt = marginTop;
  if (marginBottom !== undefined) style.marginBottomPt = marginBottom;
  if (paddingLeft !== undefined) style.paddingLeftPt = paddingLeft;
  if (fontSize !== undefined) style.fontSize = fontSize;
  const lineHeight = styles["line-height"];
  if (lineHeight && lineHeight !== "normal" && /^\d+(\.\d+)?$/.test(lineHeight)) {
    const value = Number.parseFloat(lineHeight);
    if (value >= 1 && value <= 3) style.lineHeight = value;
  }
  return style;
}

type Marks = { bold: boolean; italic: boolean; underline: boolean };

function pushText(target: LetterInline[], text: string, marks: Marks) {
  if (!text) return;
  const last = target[target.length - 1];
  if (
    last &&
    Boolean(last.bold) === marks.bold &&
    Boolean(last.italic) === marks.italic &&
    Boolean(last.underline) === marks.underline
  ) {
    last.text += text;
    return;
  }
  target.push({
    text,
    bold: marks.bold || undefined,
    italic: marks.italic || undefined,
    underline: marks.underline || undefined,
  });
}

/** Collapse HTML whitespace so editor newlines do not become PDF hard wraps. */
function normalizeSoftHtmlText(text: string): string {
  return decodeEntities(text).replace(/[\r\n\t\f\v]+/g, " ").replace(/ {2,}/g, " ");
}

function trimParagraphEdges(parts: LetterInline[]): LetterInline[] {
  if (!parts.length) return parts;
  const cloned = parts.map((part) => ({ ...part }));
  cloned[0]!.text = cloned[0]!.text.replace(/^ +/, "");
  const last = cloned[cloned.length - 1]!;
  last.text = last.text.replace(/ +$/g, "");
  return cloned.filter((part) => part.text.length > 0);
}

/**
 * Keep modest first-line indents from leading &nbsp;/spaces as paddingLeft.
 * Ignore huge space runs (legacy fake right-align); those should use text-align instead.
 */
function takeLeadingIndent(parts: LetterInline[]): {
  parts: LetterInline[];
  paddingLeftPt?: number;
} {
  if (!parts.length) return { parts };
  const first = parts[0]!;
  const match = first.text.match(/^( +)/);
  if (!match) return { parts: trimParagraphEdges(parts) };
  const spaces = match[1]!.length;
  if (spaces > 24) {
    // Likely fake alignment via spaces — drop them so text-align can work cleanly.
    return { parts: trimParagraphEdges(parts) };
  }
  const rest = parts.map((part, index) =>
    index === 0 ? { ...part, text: part.text.slice(spaces) } : { ...part },
  );
  return {
    parts: trimParagraphEdges(rest),
    // ~NotoSans space width at 11pt
    paddingLeftPt: spaces * 2.8,
  };
}

export function letterHtmlToBlocks(html: string): LetterBlock[] {
  const sanitized = sanitizeLetterHtml(html);
  const blocks: LetterBlock[] = [];
  const marks: Marks = { bold: false, italic: false, underline: false };
  let current: LetterInline[] | null = null;
  let currentStyle: LetterParagraphStyle = {};
  let listType: "ul" | "ol" | null = null;
  let listItems: LetterInline[][] = [];
  let listItem: LetterInline[] | null = null;
  let inTable = false;
  let tableRows: LetterTableCell[][] = [];
  let tableRow: LetterTableCell[] | null = null;
  let tableCell: LetterInline[] | null = null;
  let tableCellMeta: Omit<LetterTableCell, "children"> = {};

  function inlineTarget(): LetterInline[] | null {
    if (tableCell) return tableCell;
    if (listItem) return listItem;
    return current;
  }

  function ensureInlineTarget(): LetterInline[] {
    if (tableCell) return tableCell;
    if (listItem) return listItem;
    if (!current) current = [];
    return current;
  }

  function flushParagraph() {
    if (tableCell || inTable) return;
    if (!current) return;
    const { parts: children, paddingLeftPt } = takeLeadingIndent(current);
    const hasVisibleText = children.some((part) => part.text.replace(/\n/g, "").trim());
    if (hasVisibleText) {
      blocks.push({
        type: "p",
        ...currentStyle,
        ...(paddingLeftPt && !currentStyle.paddingLeftPt
          ? { paddingLeftPt }
          : {}),
        children,
      });
    } else {
      // Keep blank editor paragraphs / <br>-only lines so PDF vertical spacing is preserved.
      // Do not inflate marginBottom — renderer matches editor [&_p]:my-1 spacing.
      blocks.push({
        type: "p",
        ...currentStyle,
        children: [{ text: " " }],
      });
    }
    current = null;
    currentStyle = {};
  }

  function flushList() {
    if (inTable) return;
    if (listType && listItems.length > 0) {
      blocks.push({ type: listType, items: listItems });
    }
    listType = null;
    listItems = [];
    listItem = null;
  }

  function finishTableCell() {
    if (!tableRow || !tableCell) return;
    const hasText = tableCell.some((part) => part.text.trim());
    if (hasText || tableCellMeta.header) {
      tableRow.push({ ...tableCellMeta, children: tableCell });
    }
    tableCell = null;
    tableCellMeta = {};
  }

  function finishTableRow() {
    finishTableCell();
    if (tableRow && tableRow.length > 0) {
      tableRows.push(tableRow);
    }
    tableRow = null;
  }

  function flushTable() {
    finishTableRow();
    if (tableRows.length > 0) {
      blocks.push({ type: "table", rows: tableRows });
    }
    tableRows = [];
    inTable = false;
  }

  function cellLineBreak() {
    if (!tableCell) return;
    const hasText = tableCell.some((part) => part.text.trim());
    if (hasText) pushText(tableCell, "\n", marks);
  }

  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(sanitized))) {
    if (match[3] != null) {
      const text = normalizeSoftHtmlText(match[3]);
      if (!text) continue;
      if (inTable && !tableCell) continue;
      const target = inlineTarget();
      if (target) pushText(target, text, marks);
      else if (!inTable) {
        if (!current) current = [];
        pushText(current, text, marks);
      }
      continue;
    }

    const tag = match[1]!.toLowerCase();
    const closing = match[0].startsWith("</");
    const attrs = match[2] ?? "";

    if (tag === "br") {
      if (tableCell) pushText(tableCell, "\n", marks);
      else if (listItem) pushText(listItem, "\n", marks);
      else {
        ensureInlineTarget();
        pushText(current!, "\n", marks);
      }
      continue;
    }

    if (tag === "strong" || tag === "b") {
      marks.bold = !closing;
      continue;
    }
    if (tag === "em" || tag === "i") {
      marks.italic = !closing;
      continue;
    }
    if (tag === "u") {
      marks.underline = !closing;
      continue;
    }
    if (tag === "span") continue;

    if (tag === "table") {
      if (closing) {
        flushTable();
      } else {
        flushParagraph();
        flushList();
        flushTable();
        inTable = true;
        tableRows = [];
      }
      continue;
    }

    if (tag === "thead" || tag === "tbody" || tag === "tfoot") continue;

    if (tag === "tr") {
      if (!inTable) continue;
      if (closing) {
        finishTableRow();
      } else {
        finishTableRow();
        tableRow = [];
      }
      continue;
    }

    if (tag === "td" || tag === "th") {
      if (!inTable) continue;
      if (closing) {
        finishTableCell();
      } else {
        finishTableCell();
        if (!tableRow) tableRow = [];
        tableCell = [];
        tableCellMeta = {
          header: tag === "th",
          align: parseTextAlign(attrs),
          colspan: parseTableSpan(attrs, "colspan"),
          rowspan: parseTableSpan(attrs, "rowspan"),
        };
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      if (inTable) {
        if (!closing && tableCell) cellLineBreak();
        continue;
      }
      if (closing) {
        if (listItem) {
          listItems.push(listItem);
          listItem = null;
        }
        flushList();
      } else {
        flushParagraph();
        flushList();
        listType = tag;
        listItems = [];
      }
      continue;
    }

    if (tag === "li") {
      if (inTable && tableCell) {
        if (!closing) cellLineBreak();
        continue;
      }
      if (closing) {
        if (listItem) listItems.push(listItem);
        listItem = null;
      } else {
        if (listItem) listItems.push(listItem);
        listItem = [];
      }
      continue;
    }

    if (tag === "p" || tag === "div") {
      if (inTable && tableCell) {
        if (!closing) cellLineBreak();
        continue;
      }
      if (closing) {
        flushParagraph();
      } else {
        flushParagraph();
        current = [];
        currentStyle = parseParagraphStyle(attrs);
      }
    }
  }

  if (listItem) listItems.push(listItem);
  flushTable();
  flushList();
  flushParagraph();
  return blocks;
}
