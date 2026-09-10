import type { OfficialLetterStatus, Prisma, PrismaClient } from "@prisma/client";
import { writeAuditLog, writeAuditLogTx } from "@/lib/audit";
import { parseBusinessDate } from "@/lib/business-dates";
import {
  defaultSignatoryForCode,
  IMAGE_DATA_URL_MAX,
  isImageDataUrl,
  isOperationalLetterCompany,
  letterHtmlHasText,
  sanitizeLetterHtml,
} from "@/lib/letter-content";
import {
  allocateLetterSequence,
  formatLetterSerialNumber,
  getLetterFinancialYear,
} from "@/lib/letter-number";
import { generateOfficialLetterPdf } from "@/lib/letter-pdf";

type Db = PrismaClient | Prisma.TransactionClient;

export class LetterServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "LetterServiceError";
  }
}

const letterListInclude = {
  company: { select: { id: true, name: true, code: true, isPractice: true, isActive: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

const letterDetailInclude = {
  company: {
    select: {
      id: true,
      name: true,
      code: true,
      isPractice: true,
      isActive: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
      tagline: true,
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export type CreateOfficialLetterInput = {
  companyId: string;
  letterDate: string;
  content: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureImageData?: string | null;
  useCompanySignature?: boolean;
  stampEnabled?: boolean;
  stampImageData?: string | null;
  printSignatureEnabled?: boolean;
  asDraft?: boolean;
};

export type OfficialLetterListFilters = {
  companyId?: string;
  status?: OfficialLetterStatus;
  fromDate?: string;
  toDate?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

function requireLetterCompany(company: {
  id: string;
  name: string;
  code: string;
  isPractice: boolean;
  isActive: boolean;
  signatureImageData?: string | null;
  stampImageData?: string | null;
  defaultSignatoryName?: string | null;
  defaultSignatoryDesignation?: string | null;
  printContentTopOffsetMm: number;
}) {
  if (!isOperationalLetterCompany(company)) {
    throw new LetterServiceError(
      "INVALID_COMPANY",
      "Letters can only be created for Ivaan Solar Energy and PCM Ventures.",
      400,
    );
  }
  return company;
}

export function serializeLetterListItem(
  letter: {
    id: string;
    status: OfficialLetterStatus;
    letterSerialNumber: string | null;
    letterDate: Date;
    signatoryName: string;
    signatoryDesignation: string;
    generatedAt: Date | null;
    createdAt: Date;
    company: { id: string; name: string; code: string };
    createdBy: { id: string; name: string; email: string };
  },
) {
  return {
    id: letter.id,
    status: letter.status,
    letterSerialNumber: letter.letterSerialNumber,
    letterDate: letter.letterDate.toISOString().slice(0, 10),
    signatoryName: letter.signatoryName,
    signatoryDesignation: letter.signatoryDesignation,
    hasPdf: Boolean(letter.generatedAt),
    createdAt: letter.createdAt.toISOString(),
    company: {
      id: letter.company.id,
      name: letter.company.name,
      code: letter.company.code,
    },
    createdBy: letter.createdBy,
  };
}

export function serializeLetterDetail(
  letter: {
    id: string;
    status: OfficialLetterStatus;
    letterSerialNumber: string | null;
    letterDate: Date;
    signatoryName: string;
    signatoryDesignation: string;
    generatedAt: Date | null;
    createdAt: Date;
    content: string;
    stampEnabled: boolean;
    printSignatureEnabled: boolean;
    printContentTopOffsetMm: number;
    signatureImageData?: string | null;
    stampImageData?: string | null;
    useCompanySignature?: boolean;
    financialYear: string;
    sequenceNumber: number | null;
    company: { id: string; name: string; code: string };
    createdBy: { id: string; name: string; email: string };
  },
) {
  return {
    ...serializeLetterListItem(letter),
    content: letter.content,
    stampEnabled: letter.stampEnabled,
    printSignatureEnabled: letter.printSignatureEnabled,
    printContentTopOffsetMm: letter.printContentTopOffsetMm,
    hasSignature: Boolean(letter.signatureImageData),
    hasStamp: Boolean(letter.stampImageData),
    signatureImageData: letter.signatureImageData ?? null,
    stampImageData: letter.stampImageData ?? null,
    generatedAt: letter.generatedAt?.toISOString() ?? null,
    financialYear: letter.financialYear,
    sequenceNumber: letter.sequenceNumber,
  };
}

export async function listOfficialLetters(db: Db, filters: OfficialLetterListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const where: Prisma.OfficialLetterWhereInput = {
    company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
  };

  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.status) where.status = filters.status;
  if (filters.fromDate || filters.toDate) {
    where.letterDate = {};
    if (filters.fromDate) where.letterDate.gte = parseBusinessDate(filters.fromDate);
    if (filters.toDate) where.letterDate.lte = parseBusinessDate(filters.toDate);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { letterSerialNumber: { contains: q, mode: "insensitive" } },
      { signatoryName: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, items] = await Promise.all([
    db.officialLetter.count({ where }),
    db.officialLetter.findMany({
      where,
      include: letterListInclude,
      omit: { generatedPdfData: true, signatureImageData: true, stampImageData: true, content: true },
      orderBy: [{ createdAt: "desc" }, { letterSerialNumber: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: items.map(serializeLetterListItem),
    total,
    page,
    pageSize,
  };
}

export async function getOfficialLetterById(db: Db, id: string) {
  const letter = await db.officialLetter.findFirst({
    where: {
      id,
      company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
    },
    include: letterDetailInclude,
    omit: { generatedPdfData: true },
  });
  return letter;
}

export async function getOfficialLetterPdfBytes(db: Db, id: string): Promise<Buffer | null> {
  const letter = await db.officialLetter.findUnique({
    where: { id },
    select: { generatedPdfData: true, company: { select: { code: true, isPractice: true } } },
  });
  if (!letter || !isOperationalLetterCompany(letter.company) || !letter.generatedPdfData) {
    return null;
  }
  return Buffer.from(letter.generatedPdfData);
}

async function resolveCreateSnapshot(
  db: Db,
  input: CreateOfficialLetterInput,
  options?: { allowEmptyContent?: boolean },
) {
  const company = await db.company.findUnique({
    where: { id: input.companyId },
    select: {
      id: true,
      name: true,
      code: true,
      isPractice: true,
      isActive: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
      tagline: true,
      signatureImageData: true,
      stampImageData: true,
      defaultSignatoryName: true,
      defaultSignatoryDesignation: true,
      printContentTopOffsetMm: true,
    },
  });
  if (!company) {
    throw new LetterServiceError("NOT_FOUND", "Company not found.", 404);
  }
  requireLetterCompany(company);

  const content = sanitizeLetterHtml(input.content);
  if (!options?.allowEmptyContent && !letterHtmlHasText(content)) {
    throw new LetterServiceError("VALIDATION_ERROR", "Enter letter content.", 400);
  }

  const fallback = defaultSignatoryForCode(company.code);
  const signatoryName = input.signatoryName.trim() || company.defaultSignatoryName || fallback.name;
  const signatoryDesignation =
    input.signatoryDesignation.trim() || company.defaultSignatoryDesignation || fallback.designation;

  let signatureImageData: string | null = null;
  const rawSignature =
    input.useCompanySignature === false ? input.signatureImageData : input.signatureImageData;
  if (rawSignature) {
    const trimmed = rawSignature.trim();
    if (trimmed && (!isImageDataUrl(trimmed) || trimmed.length > IMAGE_DATA_URL_MAX)) {
      throw new LetterServiceError("VALIDATION_ERROR", "Signature must be a PNG, JPEG, or WebP image.", 400);
    }
    signatureImageData = trimmed || null;
  }
  if (input.useCompanySignature !== false && !signatureImageData) {
    signatureImageData = company.signatureImageData;
  }

  const stampEnabled = input.stampEnabled !== false;
  const stampImageData = stampEnabled
    ? input.stampImageData !== undefined
      ? input.stampImageData
      : company.stampImageData
    : null;
  const printSignatureEnabled = input.printSignatureEnabled !== false;
  const letterDate = parseBusinessDate(input.letterDate);
  const financialYear = getLetterFinancialYear(letterDate);

  return {
    company,
    content,
    signatoryName,
    signatoryDesignation,
    signatureImageData,
    stampEnabled,
    stampImageData,
    printSignatureEnabled,
    letterDate,
    financialYear,
  };
}

export async function createOfficialLetter(
  prisma: PrismaClient,
  input: CreateOfficialLetterInput,
  createdById: string,
) {
  const asDraft = Boolean(input.asDraft);
  const snapshot = await resolveCreateSnapshot(prisma, input, { allowEmptyContent: asDraft });

  const created = await prisma.$transaction(async (tx) => {
    let sequenceNumber: number | null = null;
    let letterSerialNumber: string | null = null;
    if (!asDraft) {
      sequenceNumber = await allocateLetterSequence(tx, snapshot.company.id, snapshot.financialYear);
      letterSerialNumber = formatLetterSerialNumber(
        snapshot.company.code,
        snapshot.financialYear,
        sequenceNumber,
      );
    }

    const letter = await tx.officialLetter.create({
      data: {
        companyId: snapshot.company.id,
        status: asDraft ? "DRAFT" : "ISSUED",
        letterSerialNumber,
        financialYear: snapshot.financialYear,
        sequenceNumber,
        letterDate: snapshot.letterDate,
        content: snapshot.content,
        signatoryName: snapshot.signatoryName,
        signatoryDesignation: snapshot.signatoryDesignation,
        signatureImageData: snapshot.signatureImageData,
        stampImageData: snapshot.stampImageData,
        stampEnabled: snapshot.stampEnabled,
        printSignatureEnabled: snapshot.printSignatureEnabled,
        printContentTopOffsetMm: snapshot.company.printContentTopOffsetMm,
        createdById,
      },
      include: letterDetailInclude,
    });

    await writeAuditLogTx(tx, {
      tableName: "official_letters",
      recordId: letter.id,
      action: "CREATE",
      performedBy: createdById,
      companyId: letter.companyId,
      reference: letter.letterSerialNumber ?? "DRAFT",
      newValue: {
        status: letter.status,
        letterSerialNumber: letter.letterSerialNumber,
        companyId: letter.companyId,
        letterDate: letter.letterDate.toISOString().slice(0, 10),
      },
    });

    return letter;
  });

  if (asDraft) {
    return serializeLetterDetail(created);
  }

  return storeIssuedPdf(prisma, created.id);
}

async function storeIssuedPdf(prisma: PrismaClient, letterId: string) {
  const letter = await prisma.officialLetter.findFirstOrThrow({
    where: { id: letterId },
    include: letterDetailInclude,
  });

  const pdf = await generateOfficialLetterPdf({
    letterDate: letter.letterDate,
    content: letter.content,
    signatoryName: letter.signatoryName,
    signatoryDesignation: letter.signatoryDesignation,
    signatureImageData: letter.signatureImageData,
    stampImageData: letter.stampImageData,
    stampEnabled: letter.stampEnabled,
    printSignatureEnabled: letter.printSignatureEnabled,
    printContentTopOffsetMm: letter.printContentTopOffsetMm,
    company: letter.company,
  });

  const stored = await prisma.officialLetter.update({
    where: { id: letter.id },
    data: {
      generatedPdfData: new Uint8Array(pdf),
      generatedAt: new Date(),
    },
    include: letterDetailInclude,
    omit: { generatedPdfData: true },
  });

  return serializeLetterDetail(stored);
}

export async function updateOfficialLetterDraft(
  prisma: PrismaClient,
  id: string,
  input: CreateOfficialLetterInput,
  updatedById: string,
) {
  const existing = await prisma.officialLetter.findFirst({
    where: {
      id,
      company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
    },
  });
  if (!existing) {
    throw new LetterServiceError("NOT_FOUND", "Letter not found.", 404);
  }
  if (existing.status !== "DRAFT") {
    throw new LetterServiceError("LETTER_LOCKED", "Issued letters cannot be edited. Duplicate to make changes.", 409);
  }

  const snapshot = await resolveCreateSnapshot(prisma, { ...input, companyId: existing.companyId }, {
    allowEmptyContent: true,
  });

  const updated = await prisma.officialLetter.update({
    where: { id },
    data: {
      financialYear: snapshot.financialYear,
      letterDate: snapshot.letterDate,
      content: snapshot.content,
      signatoryName: snapshot.signatoryName,
      signatoryDesignation: snapshot.signatoryDesignation,
      signatureImageData: snapshot.signatureImageData,
      stampImageData: snapshot.stampImageData,
      stampEnabled: snapshot.stampEnabled,
      printSignatureEnabled: snapshot.printSignatureEnabled,
      printContentTopOffsetMm: snapshot.company.printContentTopOffsetMm,
    },
    include: letterDetailInclude,
    omit: { generatedPdfData: true },
  });

  await writeAuditLog({
    tableName: "official_letters",
    recordId: updated.id,
    action: "UPDATE",
    performedBy: updatedById,
    companyId: updated.companyId,
    reference: "DRAFT",
  });

  return serializeLetterDetail(updated);
}

export async function issueOfficialLetter(
  prisma: PrismaClient,
  id: string,
  issuedById: string,
  input?: CreateOfficialLetterInput,
) {
  if (input) {
    await updateOfficialLetterDraft(prisma, id, input, issuedById);
  }

  const existing = await prisma.officialLetter.findFirst({
    where: {
      id,
      company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
    },
    include: letterDetailInclude,
  });
  if (!existing) {
    throw new LetterServiceError("NOT_FOUND", "Letter not found.", 404);
  }
  if (existing.status === "ISSUED" && existing.generatedPdfData) {
    return serializeLetterDetail({ ...existing, generatedPdfData: undefined });
  }
  if (!letterHtmlHasText(existing.content)) {
    throw new LetterServiceError("VALIDATION_ERROR", "Enter letter content before generating the PDF.", 400);
  }

  const issued = await prisma.$transaction(async (tx) => {
    const locked = await tx.officialLetter.findUnique({ where: { id } });
    if (!locked) {
      throw new LetterServiceError("NOT_FOUND", "Letter not found.", 404);
    }
    if (locked.status === "ISSUED" && locked.letterSerialNumber) {
      return tx.officialLetter.findFirstOrThrow({
        where: { id },
        include: letterDetailInclude,
      });
    }

    const sequenceNumber = await allocateLetterSequence(tx, locked.companyId, locked.financialYear);
    const company = await tx.company.findUniqueOrThrow({
      where: { id: locked.companyId },
      select: { code: true },
    });
    const letterSerialNumber = formatLetterSerialNumber(company.code, locked.financialYear, sequenceNumber);

    return tx.officialLetter.update({
      where: { id },
      data: {
        status: "ISSUED",
        sequenceNumber,
        letterSerialNumber,
      },
      include: letterDetailInclude,
    });
  });

  return storeIssuedPdf(prisma, issued.id);
}

export async function duplicateOfficialLetter(
  prisma: PrismaClient,
  sourceId: string,
  createdById: string,
  letterDate: string,
) {
  const source = await prisma.officialLetter.findFirst({
    where: {
      id: sourceId,
      company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
    },
  });
  if (!source) {
    throw new LetterServiceError("NOT_FOUND", "Letter not found.", 404);
  }

  return createOfficialLetter(
    prisma,
    {
      companyId: source.companyId,
      letterDate,
      content: source.content,
      signatoryName: source.signatoryName,
      signatoryDesignation: source.signatoryDesignation,
      signatureImageData: source.signatureImageData,
      useCompanySignature: false,
      stampEnabled: source.stampEnabled,
      stampImageData: source.stampImageData,
      printSignatureEnabled: source.printSignatureEnabled,
      asDraft: true,
    },
    createdById,
  );
}

export async function buildPrintLetterPdf(db: Db, id: string): Promise<Buffer> {
  const letter = await db.officialLetter.findFirst({
    where: {
      id,
      company: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
    },
    include: {
      company: {
        select: {
          name: true,
          code: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          phone: true,
          email: true,
          gstNumber: true,
          tagline: true,
        },
      },
    },
  });
  if (!letter) {
    throw new LetterServiceError("NOT_FOUND", "Letter not found.", 404);
  }

  return generateOfficialLetterPdf(
    {
      letterDate: letter.letterDate,
      content: letter.content,
      signatoryName: letter.signatoryName,
      signatoryDesignation: letter.signatoryDesignation,
      signatureImageData: letter.signatureImageData,
      stampImageData: letter.stampImageData,
      stampEnabled: letter.stampEnabled,
      printSignatureEnabled: letter.printSignatureEnabled,
      printContentTopOffsetMm: letter.printContentTopOffsetMm,
      company: letter.company,
    },
    "print",
  );
}
