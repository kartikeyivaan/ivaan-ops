export type CellEvaluation = {
  value: number | null;
  error?: string;
  isFormula: boolean;
};

const FORMULA_BODY_PATTERN = /^[\d+\-*/().\s]+$/;

export function evaluateCellInput(input: string): CellEvaluation {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: null, isFormula: false };
  }

  if (trimmed.startsWith("=")) {
    const expression = trimmed.slice(1).trim();
    if (!expression) {
      return { value: null, error: "Enter a formula after =", isFormula: true };
    }

    try {
      const value = evaluateMathExpression(expression);
      return { value, isFormula: true };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Invalid formula",
        isFormula: true,
      };
    }
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return {
      value: null,
      error: "Enter a number or formula like =20*33",
      isFormula: false,
    };
  }

  return { value, isFormula: false };
}

export function evaluateMathExpression(expression: string): number {
  const normalized = expression.replace(/\s+/g, "");
  if (!normalized) {
    throw new Error("Formula is empty");
  }
  if (!FORMULA_BODY_PATTERN.test(normalized)) {
    throw new Error("Formula can only use numbers and + - * / ( )");
  }

  let index = 0;

  function peek(): string {
    return normalized[index] ?? "";
  }

  function consume(expected?: string): string {
    const char = normalized[index];
    if (!char) {
      throw new Error("Unexpected end of formula");
    }
    if (expected && char !== expected) {
      throw new Error(`Unexpected character '${char}'`);
    }
    index += 1;
    return char;
  }

  function parseNumber(): number {
    const start = index;
    while (/[\d.]/.test(peek())) {
      index += 1;
    }

    const raw = normalized.slice(start, index);
    if (!raw || raw === "." || raw.split(".").length > 2) {
      throw new Error("Invalid number in formula");
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error("Invalid number in formula");
    }
    return value;
  }

  function parseFactor(): number {
    if (peek() === "(") {
      consume("(");
      const value = parseExpression();
      if (peek() !== ")") {
        throw new Error("Missing closing bracket");
      }
      consume(")");
      return value;
    }

    if (peek() === "-") {
      consume("-");
      return -parseFactor();
    }

    if (peek() === "+") {
      consume("+");
      return parseFactor();
    }

    return parseNumber();
  }

  function parseTerm(): number {
    let value = parseFactor();

    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      const right = parseFactor();
      if (operator === "*") {
        value *= right;
      } else {
        if (right === 0) {
          throw new Error("Cannot divide by zero");
        }
        value /= right;
      }
    }

    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();

    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }

    return value;
  }

  const result = parseExpression();
  if (index < normalized.length) {
    throw new Error("Unexpected characters in formula");
  }
  if (!Number.isFinite(result)) {
    throw new Error("Invalid formula result");
  }

  return Number(result.toFixed(6));
}

export function formatResolvedCellValue(value: number): string {
  return String(Number(value.toFixed(6)));
}
