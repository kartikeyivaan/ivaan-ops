import { z } from "zod";
import { MAX_SERIALS_PER_ENTRY } from "@/lib/inventory";
import { isStrongPassword, STRONG_PASSWORD_HINT } from "@/lib/password-policy";

const serialNumbersPerEntrySchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(MAX_SERIALS_PER_ENTRY, {
    message: `A single entry can include at most ${MAX_SERIALS_PER_ENTRY} serial numbers.`,
  });

const strongPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine(isStrongPassword, { message: STRONG_PASSWORD_HINT });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const companySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(10).toUpperCase(),
  bankDetails: z.string().optional(),
  termsAndConditions: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  digitalSignatureUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const warehouseSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(2),
  code: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  officialContactNumber: z.string().optional(),
  personalContactNumber: z.string().optional(),
  digitalVisitingCardUrl: z.string().url().optional().or(z.literal("")),
  password: z.string().min(8).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  roleIds: z.array(z.string().uuid()).min(1),
  companyIds: z.array(z.string().uuid()).min(1),
});

export const changePasswordSchema = z
  .object({
    password: strongPasswordField,
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const selfChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPasswordField,
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from your current password",
    path: ["newPassword"],
  });

export const setCompanySchema = z.object({
  companyId: z.string().uuid(),
});

export const customerContactSchema = z.object({
  name: z.string().min(2),
  designation: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export const customerSchema = z.object({
  customerName: z.string().min(2, "Firm name is required"),
  contactPersonName: z
    .string()
    .optional()
    .refine((value) => !value || value.trim().length >= 2, {
      message: "Contact person name must be at least 2 characters",
    }),
  customerType: z.enum(["DEALER", "PROJECT"]),
  gstNumber: z.string().min(15, "GST number is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z
    .string()
    .regex(/^\d{6}$/, "PIN code must be 6 digits")
    .optional()
    .or(z.literal("")),
  mobile: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  assignedSalesUserId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  contacts: z.array(customerContactSchema).optional(),
});

export const customerUpdateSchema = customerSchema.partial().extend({
  contacts: z.array(customerContactSchema.extend({ id: z.string().uuid().optional() })).optional(),
});

export const customerSearchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  customerType: z.enum(["DEALER", "PROJECT"]).optional(),
  assignedSalesUserId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const customerReassignSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1),
  assignedSalesUserId: z.string().uuid(),
});

export const customerImportRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  customerName: z.string().min(2),
  customerType: z.enum(["DEALER", "PROJECT"]),
  gstNumber: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  assignedSalesEmail: z.string().email(),
  contactName: z.string().optional(),
  contactDesignation: z.string().optional(),
  contactMobile: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
});

export const customerImportSchema = z.object({
  mode: z.enum(["preview", "import"]),
  rows: z.array(customerImportRowSchema).min(1),
});

export const kitComponentSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
});

export const productSchema = z.object({
  categoryId: z.string().uuid(),
  brandName: z.string().min(2).optional(),
  technologyName: z.string().optional(),
  capacity: z.coerce.number().positive().optional(),
  capacityUnit: z.enum(["WP", "KW", "KVA", "NOS", "METER"]).optional(),
  hsn: z.string().optional(),
  gstRate: z.coerce.number().min(0).max(100),
  isActive: z.boolean().default(true),
  kitComponents: z.array(kitComponentSchema).optional(),
  initialPrice: z
    .object({
      landingCost: z.coerce.number().min(0),
      standardPrice: z.coerce.number().min(0),
      minimumPrice: z.coerce.number().min(0),
      effectiveFrom: z.string().optional(),
    })
    .optional(),
});

export const productUpdateSchema = productSchema
  .omit({ initialPrice: true })
  .partial();

export const productPriceSchema = z.object({
  landingCost: z.coerce.number().min(0),
  standardPrice: z.coerce.number().min(0),
  minimumPrice: z.coerce.number().min(0),
  effectiveFrom: z.string().optional(),
});

export const productSearchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const vendorSchema = z.object({
  vendorName: z.string().min(2),
  gst: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export const vendorUpdateSchema = vendorSchema.extend({
  isActive: z.boolean().default(true),
});

export const incomingLotSchema = z.object({
  companyId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  purchaseInvoiceNo: z.string().trim().min(1, "Purchase invoice number is required."),
  purchaseDate: z.string(),
  expectedMinDate: z.string().optional(),
  expectedMaxDate: z.string().optional(),
  productId: z.string().uuid(),
  purchaseRequestLineId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive(),
  unitPurchaseRate: z.coerce.number().min(0),
  transportCharges: z.coerce.number().min(0).default(0),
  commissionCharges: z.coerce.number().min(0).default(0),
  confirmSimilar: z.boolean().optional(),
});

export const incomingLotUpdateSchema = incomingLotSchema.omit({ companyId: true });

export const incomingLotReceiveEditSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  purchaseInvoiceNo: z.string().trim().min(1, "Purchase invoice number is required."),
});

export const incomingLotCheckSchema = z.object({
  purchaseInvoiceNo: z.string().trim().min(1).optional(),
  companyId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  purchaseDate: z.string().optional(),
  quantity: z.coerce.number().positive().optional(),
  unitPurchaseRate: z.coerce.number().min(0).optional(),
  excludeLotId: z.string().uuid().optional(),
});

export const inwardSchema = z.object({
  lotId: z.string().uuid(),
  receivedQty: z.coerce.number().min(0),
  damagedQty: z.coerce.number().min(0).default(0),
  serialNumbers: z
    .array(z.string().min(1))
    .max(MAX_SERIALS_PER_ENTRY, {
      message: `A single entry can include at most ${MAX_SERIALS_PER_ENTRY} serial numbers.`,
    })
    .optional(),
});

export const damageSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  serialIds: z.array(z.string().uuid()).optional(),
  notes: z.string().optional(),
});

export const createDamageReportSchema = z.object({
  serialNumber: z.string().min(1),
  category: z.enum(["HANDLING", "STORAGE", "TRANSIT_AFTER_INWARD", "OTHER"]),
  reason: z.string().trim().min(1, "Reason is required"),
});

export const rejectDamageReportSchema = z.object({
  reason: z.string().trim().min(1, "Rejection reason is required"),
});

export const purchaseRequestNewProductSchema = z.object({
  categoryId: z.string().uuid(),
  brandName: z.string().trim().min(2),
  technologyName: z.string().trim().optional(),
  capacity: z.coerce.number().positive(),
  capacityUnit: z.enum(["WP", "KW", "KVA", "NOS", "METER"]),
  gstRate: z.coerce.number().min(0).max(100),
  hsn: z.string().optional(),
});

export const purchaseRequestLineSchema = z
  .object({
    productId: z.string().uuid().optional(),
    newProduct: purchaseRequestNewProductSchema.optional(),
    requestedQty: z.coerce.number().positive(),
    targetDate: z.string().optional().nullable(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    remarks: z.string().optional().nullable(),
  })
  .refine((line) => Boolean(line.productId) || Boolean(line.newProduct), {
    message: "Select an existing product or provide new product details.",
  });

export const createPurchaseRequestSchema = z.object({
  companyId: z.string().uuid(),
  warehouseId: z.string().uuid().optional().nullable(),
  remarks: z.string().optional().nullable(),
  lines: z.array(purchaseRequestLineSchema).min(1),
});

export const updatePurchaseRequestStatusSchema = z.object({
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "ORDERED",
    "REJECTED",
    "CANCELLED",
  ]),
  statusRemarks: z.string().optional().nullable(),
});

export const purchaseRequestSearchSchema = z.object({
  status: z
    .enum([
      "OPEN",
      "IN_PROGRESS",
      "ORDERED",
      "PARTIALLY_FULFILLED",
      "FULFILLED",
      "REJECTED",
      "CANCELLED",
    ])
    .optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qty: z.coerce.number(),
  notes: z.string().optional(),
});

const manualStockReasonSchema = z.enum([
  "FOUND_STOCK",
  "WRITE_OFF",
  "CORRECTION",
  "SAMPLE_DEMO",
  "INTER_BRANCH_PAPER",
  "CUSTOMER_RETURN_NO_SALES_DOC",
  "OTHER",
]);

const manualStockNotesSchema = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .nullable();

function refineManualStockReasonNotes(
  data: { reason: z.infer<typeof manualStockReasonSchema>; notes?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.reason === "OTHER" && !data.notes?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Notes are required when reason is Other.",
      path: ["notes"],
    });
  }
}

export const manualStockSerialInSchema = z
  .object({
    action: z.literal("IN"),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    serialNumbers: serialNumbersPerEntrySchema,
    condition: z.enum(["GOOD", "DAMAGED"]),
    reason: manualStockReasonSchema,
    notes: manualStockNotesSchema,
  })
  .superRefine(refineManualStockReasonNotes);

export const manualStockSerialOutSchema = z
  .object({
    action: z.literal("OUT"),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    serialNumbers: serialNumbersPerEntrySchema,
    reason: manualStockReasonSchema,
    notes: manualStockNotesSchema,
  })
  .superRefine(refineManualStockReasonNotes);

export const manualStockChangeConditionSchema = z
  .object({
    action: z.literal("CHANGE_CONDITION"),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    serialNumbers: serialNumbersPerEntrySchema,
    condition: z.enum(["GOOD", "DAMAGED"]),
    reason: manualStockReasonSchema,
    notes: manualStockNotesSchema,
  })
  .superRefine(refineManualStockReasonNotes);

export const manualStockQtyAdjustSchema = z
  .object({
    action: z.enum(["IN", "OUT"]),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    qty: z.coerce.number().positive(),
    reason: manualStockReasonSchema,
    notes: manualStockNotesSchema,
    mode: z.literal("QTY"),
  })
  .superRefine(refineManualStockReasonNotes);

export const manualStockEntrySchema = z.union([
  manualStockSerialInSchema,
  manualStockSerialOutSchema,
  manualStockChangeConditionSchema,
  manualStockQtyAdjustSchema,
]);

export const createOpeningAuditSchema = z.object({
  warehouseId: z.string().uuid(),
});

export const upsertOpeningLineSchema = z.object({
  productId: z.string().uuid(),
  condition: z.enum(["GOOD", "DAMAGED"]).default("GOOD"),
  physicalQty: z.coerce.number().min(0).optional(),
  serialNumbers: z.array(z.string().min(1)).optional(),
  remarks: z.string().optional().nullable(),
});

export const createDailyAuditSchema = z.object({
  warehouseId: z.string().uuid(),
  auditDate: z.string().optional(),
});

export const updateDailyAuditLineSchema = z.object({
  physicalQty: z.coerce.number().min(0),
  remarks: z.string().optional().nullable(),
});

export const inventorySearchSchema = z.object({
  q: z.string().optional(),
  warehouseId: z.string().uuid().optional(),
  status: z.enum(["INCOMING", "CLOSED"]).optional(),
  productId: z.string().uuid().optional(),
  transactionType: z
    .enum(["INWARD", "BOOK", "DISPATCH", "DAMAGE", "TRANSFER", "ADJUST"])
    .optional(),
});

export const transferLineSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  serialIds: z.array(z.string().uuid()).optional(),
});

export const createTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(transferLineSchema).min(1),
});

export const receiveTransferLineSchema = z.object({
  lineId: z.string().uuid(),
  receivedQty: z.coerce.number().positive(),
});

export const receiveTransferSchema = z.object({
  lines: z.array(receiveTransferLineSchema).min(1),
});

export const transferSearchSchema = z.object({
  direction: z.enum(["outgoing", "incoming", "all"]).optional(),
  status: z
    .enum(["DRAFT", "DISPATCHED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"])
    .optional(),
});

export const quotationLineSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
});

const quotationDeliveryTermsShape = {
  deliveryTermMode: z
    .enum(["ADVANCE_BOOKING", "READY_STOCK", "SUBJECT_TO_AVAILABILITY"])
    .default("SUBJECT_TO_AVAILABILITY"),
  requiredPaymentPercent: z.coerce.number().positive().max(100).nullable().optional(),
  dispatchMinDays: z.coerce.number().int().min(0).nullable().optional(),
  dispatchMaxDays: z.coerce.number().int().min(0).nullable().optional(),
};

function validateQuotationDeliveryTerms(
  data: {
    deliveryTermMode: "ADVANCE_BOOKING" | "READY_STOCK" | "SUBJECT_TO_AVAILABILITY";
    requiredPaymentPercent?: number | null;
    dispatchMinDays?: number | null;
    dispatchMaxDays?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.deliveryTermMode === "ADVANCE_BOOKING") {
    if (data.requiredPaymentPercent == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Advance payment percentage is required.",
        path: ["requiredPaymentPercent"],
      });
    }
    if (data.dispatchMinDays == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum dispatch days are required.",
        path: ["dispatchMinDays"],
      });
    }
    if (data.dispatchMaxDays == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum dispatch days are required.",
        path: ["dispatchMaxDays"],
      });
    }
    if (
      data.dispatchMinDays != null &&
      data.dispatchMaxDays != null &&
      data.dispatchMinDays > data.dispatchMaxDays
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum dispatch days cannot exceed maximum dispatch days.",
        path: ["dispatchMaxDays"],
      });
    }
  }

  if (
    data.deliveryTermMode === "READY_STOCK" &&
    data.requiredPaymentPercent != null &&
    data.requiredPaymentPercent !== 100
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ready stock requires 100% payment.",
      path: ["requiredPaymentPercent"],
    });
  }
}

const createQuotationBaseSchema = z.object({
  customerId: z.string().uuid(),
  salesUserId: z.string().uuid().optional(),
  notes: z.string().optional(),
  send: z.boolean().default(false),
  proceedWithWarnings: z.boolean().default(false),
  lines: z.array(quotationLineSchema).min(1),
  ...quotationDeliveryTermsShape,
});

export const createQuotationSchema = createQuotationBaseSchema.superRefine(
  validateQuotationDeliveryTerms,
);

export const reviseQuotationSchema = createQuotationBaseSchema
  .omit({ customerId: true, salesUserId: true })
  .superRefine(validateQuotationDeliveryTerms);

export const approveQuotationPriceSchema = z.object({
  remarks: z.string().optional(),
});

export const rejectApprovalSchema = z.object({
  reason: z.string().min(3),
});

export const quotationSearchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "EXPIRED", "CONVERTED"]).optional(),
  customerId: z.string().uuid().optional(),
});

export const createProformaInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  salesUserId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  notes: z.string().optional(),
  issue: z.boolean().default(false),
  lines: z.array(quotationLineSchema).min(1),
});

export const convertQuotationToPiSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  issue: z.boolean().default(true),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1, "Payment date is required."),
  paymentMode: z.enum(["BANK_TRANSFER", "CHEQUE", "CASH", "UPI", "NEFT", "RTGS"]),
  receivedInAccount: z.enum(["SBI", "ICICI", "HDFC"]),
  referenceNo: z.string().trim().min(1, "Reference is required."),
  notes: z.string().optional(),
});

export const updatePaymentSchema = recordPaymentSchema;

export const requestBookingSchema = z.object({
  warehouseId: z.string().uuid(),
});

export const approveBookingSchema = z.object({
  remarks: z.string().optional(),
});

export const dispatchTodayDraftSchema = z.object({
  vehicleNo: z.string().trim().max(100).optional(),
  driverName: z.string().trim().max(100).optional(),
  receiverName: z.string().trim().max(100).optional(),
  receiverMobile: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const markDispatchTodaySchema = dispatchTodayDraftSchema.extend({
  confirmEarly: z.boolean().optional(),
  confirmCrossCompany: z.boolean().optional(),
  fromCompanyId: z.string().uuid().optional(),
});

export const approveDispatchTodaySchema = z.object({
  remarks: z.string().optional(),
});

export const requestPiCreditSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const approvePiCreditSchema = z.object({
  remarks: z.string().optional(),
});

export const requestPiCancelSchema = z.object({
  remarks: z.string().optional(),
});

export const approvePiCancelSchema = z.object({
  remarks: z.string().optional(),
});

export const proformaInvoiceSearchSchema = z.object({
  q: z.string().optional(),
  status: z
    .enum([
      "DRAFT",
      "ISSUED",
      "PENDING_BOOKING",
      "BOOKED",
      "PARTIALLY_DISPATCHED",
      "FULLY_DISPATCHED",
      "CANCEL_PENDING",
      "CANCELLED",
    ])
    .optional(),
  customerId: z.string().uuid().optional(),
});

export const dispatchLineSchema = z.object({
  proformaInvoiceItemId: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  serialIds: z.array(z.string().uuid()).max(MAX_SERIALS_PER_ENTRY).optional(),
});

export const createDispatchSchema = z.object({
  proformaInvoiceId: z.string().uuid(),
  vehicleNo: z.string().trim().min(1, "Vehicle number is required."),
  driverName: z.string().optional(),
  receiverName: z.string().trim().min(1, "Receiver name is required."),
  receiverMobile: z.string().trim().min(10, "Receiver mobile is required."),
  signatureUrl: z
    .string()
    .max(200_000)
    .refine(
      (value) =>
        value === "" ||
        value.startsWith("data:image/png;base64,") ||
        value.startsWith("data:image/jpeg;base64,") ||
        value.startsWith("data:image/webp;base64,"),
      "Signature must be a PNG, JPEG, or WebP image.",
    )
    .optional(),
  notes: z.string().optional(),
  confirm: z.boolean().default(true),
  lines: z.array(dispatchLineSchema).min(1),
});

export const dispatchSearchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["DRAFT", "DISPATCHED", "CANCEL_PENDING", "CANCELLED"]).optional(),
  customerId: z.string().uuid().optional(),
  proformaInvoiceId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const projectDispatchLineSchema = z.object({
  materialLineId: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  serialIds: z.array(z.string().uuid()).max(MAX_SERIALS_PER_ENTRY).optional(),
  kitProductId: z.string().uuid().optional(),
  kitProductName: z.string().optional(),
  kitBomQty: z.coerce.number().optional(),
});

export const createProjectDispatchSchema = z.object({
  projectId: z.string().uuid(),
  vehicleNo: z.string().trim().optional(),
  receiverName: z.string().trim().optional(),
  receiverMobile: z.string().trim().optional(),
  signatureData: z
    .string()
    .max(200_000)
    .refine(
      (value) =>
        value === "" ||
        !value ||
        value.startsWith("data:image/png;base64,") ||
        value.startsWith("data:image/jpeg;base64,") ||
        value.startsWith("data:image/webp;base64,"),
      "Signature must be a PNG, JPEG, or WebP image.",
    )
    .optional(),
  remarks: z.string().optional(),
  confirm: z.boolean().default(true),
  lines: z.array(projectDispatchLineSchema).min(1),
});

export const projectDispatchSearchSchema = z.object({
  q: z.string().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "DISPATCHED", "CANCEL_PENDING", "CANCELLED"]).optional(),
});

export const lookupProjectDispatchSerialsSchema = z.object({
  projectId: z.string().uuid(),
  productId: z.string().uuid(),
  serialNumbers: serialNumbersPerEntrySchema,
});

export const returnProjectStockSchema = z.object({
  lineId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  remarks: z.string().optional(),
});

export const lookupDispatchSerialsSchema = z.object({
  piId: z.string().uuid(),
  productId: z.string().uuid(),
  serialNumbers: serialNumbersPerEntrySchema,
});

export const checkInventorySerialsSchema = z.object({
  serialNumbers: serialNumbersPerEntrySchema,
});

export const reportSearchSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  salesUserId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  customerType: z.enum(["DEALER", "PROJECT"]).optional(),
  ageingBucket: z.enum(["0-30", "31-60", "61-90", "90+"]).optional(),
  q: z.string().optional(),
  format: z.enum(["json", "xlsx", "pdf"]).optional(),
});

export const requestDispatchCancelSchema = z.object({
  remarks: z.string().optional(),
});

export const approveDispatchCancelSchema = z.object({
  remarks: z.string().optional(),
});

const projectProposalPricingBaseSchema = z.object({
  packageId: z.string().uuid(),
  connectionPhase: z.enum(["SINGLE_PHASE", "THREE_PHASE"]),
  inverterBrandCodes: z.array(z.string().min(1)).min(1),
  inverterUpgradeId: z.string().uuid().nullable().optional(),
  structureType: z.enum(["CUSTOM_FABRICATED", "PREFAB_C_CHANNEL", "MONO_RAIL"]),
  buildingType: z.enum(["APARTMENT", "BUNGALOW"]),
  extraFloors: z.coerce.number().int().min(0).default(0),
  ndcrAdditionalPanels: z.coerce.number().int().min(0).default(0),
  ndcrPanelWp: z.coerce.number().int().min(570).max(650).default(580),
  dcrAdditionalPanels: z.coerce.number().int().min(0).default(0),
  futureStructurePanels: z.coerce.number().int().min(0).default(0),
  moduleProductId: z.string().uuid().nullable().optional(),
  moduleQty: z.coerce.number().int().min(0).nullable().optional(),
  inverterCapacityKw: z.coerce.number().min(0).nullable().optional(),
  discountAmount: z.coerce.number().min(0).default(0),
  additionalCostAmount: z.coerce.number().min(0).default(0),
});

function withStructureProvisionRule<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data, ctx) => {
    if (data.moduleProductId) {
      return;
    }
    const minStructureProvision = data.dcrAdditionalPanels + data.ndcrAdditionalPanels;
    if (data.futureStructurePanels < minStructureProvision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Additional structure provision must be at least ${minStructureProvision} (additional DCR + NDCR panels).`,
        path: ["futureStructurePanels"],
      });
    }
  });
}

export const projectProposalPricingSchema = withStructureProvisionRule(
  projectProposalPricingBaseSchema,
);

export const createProjectProposalSchema = withStructureProvisionRule(
  projectProposalPricingBaseSchema.extend({
    customerName: z.string().min(2),
    customerMobile: z.string().min(10),
    shortAddress: z.string().optional(),
    salesUserId: z.string().uuid().optional(),
    enquiryId: z.string().uuid().optional(),
    proposalDate: z.string().optional(),
    notes: z.string().optional(),
  }),
);

export const updateProjectProposalSchema = withStructureProvisionRule(
  projectProposalPricingBaseSchema.extend({
    customerName: z.string().min(2),
    customerMobile: z.string().min(10),
    shortAddress: z.string().optional(),
    proposalDate: z.string().optional(),
    notes: z.string().optional(),
  }),
);

export const projectProposalSearchSchema = z.object({
  q: z.string().optional(),
  status: z
    .enum([
      "DRAFT",
      "SENT",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "CONVERTED",
      "EXPIRED",
    ])
    .optional(),
  salesUserId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  customerMobile: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const approveProjectProposalSchema = z.object({
  remarks: z.string().optional(),
});

export const rejectProjectProposalSchema = rejectApprovalSchema;

export const reviseProjectProposalSchema = updateProjectProposalSchema;

export const projectSearchSchema = z.object({
  q: z.string().optional(),
  status: z
    .enum([
      "OPEN",
      "MATERIAL_DRAFT",
      "MATERIAL_PENDING_APPROVAL",
      "MATERIAL_ASSIGNED",
      "READY_FOR_DISPATCH",
      "PARTIALLY_DISPATCHED",
      "FULLY_DISPATCHED",
      "CLOSED",
    ])
    .optional(),
});

export const addProjectMaterialLineSchema = z.object({
  productId: z.string().uuid(),
  requiredQty: z.coerce.number().positive(),
  remarks: z.string().optional(),
});

export const updateProjectMaterialLineSchema = z.object({
  requiredQty: z.coerce.number().positive(),
  remarks: z.string().nullable().optional(),
});

export const createProjectEnquirySchema = z.object({
  customerName: z.string().trim().min(2, "Customer name is required"),
  customerMobile: z.string().trim().min(10, "Mobile number is required"),
  salesUserId: z.string().uuid().optional(),
  nextFollowupAt: z.string(),
});

export const updateProjectEnquirySchema = z.object({
  customerName: z.string().trim().min(2, "Customer name is required"),
  customerMobile: z.string().trim().min(10, "Mobile number is required"),
  nextFollowupAt: z.string(),
});

export const projectEnquirySearchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["OPEN", "PROPOSAL_SENT", "WON", "LOST"]).optional(),
  salesUserId: z.string().uuid().optional(),
  customerMobile: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const createProjectEnquiryFollowupSchema = z.object({
  note: z.string().trim().min(1, "Follow-up note is required"),
  outcome: z.string().trim().optional(),
  followupDate: z.string(),
  nextFollowupAt: z.string(),
});

export const markProjectEnquiryLostSchema = z.object({
  lostReason: z.string().trim().min(2, "Lost reason is required"),
});

export const reassignProjectEnquirySchema = z.object({
  salesUserId: z.string().uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CompanyInput = z.infer<typeof companySchema>;
export type WarehouseInput = z.infer<typeof warehouseSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerReassignInput = z.infer<typeof customerReassignSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductPriceInput = z.infer<typeof productPriceSchema>;
