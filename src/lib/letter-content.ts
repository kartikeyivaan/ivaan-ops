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
    const align = parseTextAlign(attrs);
    if (align && (tag === "p" || tag === "div" || tag === "li")) {
      return `<${tag} style="text-align:${align}">`;
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

export type LetterBlock =
  | { type: "p"; align?: string; children: LetterInline[] }
  | { type: "ul"; items: LetterInline[][] }
  | { type: "ol"; items: LetterInline[][] }
  | { type: "table"; rows: LetterTableCell[][] };

type Marks = { bold: boolean; italic: boolean; underline: boolean };

function pushText(target: LetterInline[], text: string, marks: Marks) {
  const decoded = decodeEntities(text);
  if (!decoded) return;
  const last = target[target.length - 1];
  if (
    last &&
    Boolean(last.bold) === marks.bold &&
    Boolean(last.italic) === marks.italic &&
    Boolean(last.underline) === marks.underline
  ) {
    last.text += decoded;
    return;
  }
  target.push({
    text: decoded,
    bold: marks.bold || undefined,
    italic: marks.italic || undefined,
    underline: marks.underline || undefined,
  });
}

export function letterHtmlToBlocks(html: string): LetterBlock[] {
  const sanitized = sanitizeLetterHtml(html);
  const blocks: LetterBlock[] = [];
  const marks: Marks = { bold: false, italic: false, underline: false };
  let current: LetterInline[] | null = null;
  let currentAlign: string | undefined;
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
    const hasText = current.some((part) => part.text.trim());
    if (hasText) {
      blocks.push({ type: "p", align: currentAlign, children: current });
    }
    current = null;
    currentAlign = undefined;
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
      const text = match[3];
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
        currentAlign = parseTextAlign(attrs);
      }
    }
  }

  if (listItem) listItems.push(listItem);
  flushTable();
  flushList();
  flushParagraph();
  return blocks;
}
