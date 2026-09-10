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

const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const ALLOWED_TAGS = new Set(["p", "br", "div", "span", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);
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

export function sanitizeLetterHtml(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  return withoutComments.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    const closing = match.startsWith("</");
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
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

export type LetterBlock =
  | { type: "p"; align?: string; children: LetterInline[] }
  | { type: "ul"; items: LetterInline[][] }
  | { type: "ol"; items: LetterInline[][] };

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

  function flushParagraph() {
    if (!current) return;
    const hasText = current.some((part) => part.text.trim());
    if (hasText) {
      blocks.push({ type: "p", align: currentAlign, children: current });
    }
    current = null;
    currentAlign = undefined;
  }

  function flushList() {
    if (listType && listItems.length > 0) {
      blocks.push({ type: listType, items: listItems });
    }
    listType = null;
    listItems = [];
    listItem = null;
  }

  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(sanitized))) {
    if (match[3] != null) {
      const text = match[3];
      if (listItem) pushText(listItem, text, marks);
      else {
        if (!current) current = [];
        pushText(current, text, marks);
      }
      continue;
    }

    const tag = match[1]!.toLowerCase();
    const closing = match[0].startsWith("</");
    const attrs = match[2] ?? "";

    if (tag === "br") {
      if (listItem) pushText(listItem, "\n", marks);
      else {
        if (!current) current = [];
        pushText(current, "\n", marks);
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

    if (tag === "ul" || tag === "ol") {
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
  flushList();
  flushParagraph();
  return blocks;
}
