import { z } from "zod";
import { isStrongPassword, STRONG_PASSWORD_HINT } from "@/lib/password-policy";

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

export const productSchema = z.object({
  categoryId: z.string().uuid(),
  brandName: z.string().min(2),
  technologyName: z.string().optional(),
  capacity: z.coerce.number().positive(),
  capacityUnit: z.enum(["WP", "KW", "KVA", "NOS", "METER"]),
  hsn: z.string().optional(),
  gstRate: z.coerce.number().min(0).max(100),
  isActive: z.boolean().default(true),
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
  purchaseInvoiceNo: z.string().optional(),
  purchaseDate: z.string(),
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitPurchaseRate: z.coerce.number().min(0),
  transportCharges: z.coerce.number().min(0).default(0),
  commissionCharges: z.coerce.number().min(0).default(0),
});

export const incomingLotUpdateSchema = incomingLotSchema.omit({ companyId: true });

export const inwardSchema = z.object({
  lotId: z.string().uuid(),
  receivedQty: z.coerce.number().min(0),
  damagedQty: z.coerce.number().min(0).default(0),
  serialNumbers: z.array(z.string().min(1)).optional(),
});

export const damageSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  serialIds: z.array(z.string().uuid()).optional(),
  notes: z.string().optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qty: z.coerce.number(),
  notes: z.string().optional(),
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

export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  salesUserId: z.string().uuid().optional(),
  notes: z.string().optional(),
  send: z.boolean().default(false),
  lines: z.array(quotationLineSchema).min(1),
});

export const reviseQuotationSchema = createQuotationSchema.omit({ customerId: true, salesUserId: true });

export const approveQuotationPriceSchema = z.object({
  remarks: z.string().optional(),
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
  paymentDate: z.string(),
  paymentMode: z.enum(["BANK_TRANSFER", "CHEQUE", "CASH", "UPI", "NEFT", "RTGS"]),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
});

export const requestBookingSchema = z.object({
  warehouseId: z.string().uuid(),
});

export const approveBookingSchema = z.object({
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
      "CANCELLED",
    ])
    .optional(),
  customerId: z.string().uuid().optional(),
});

export const dispatchLineSchema = z.object({
  proformaInvoiceItemId: z.string().uuid(),
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  serialIds: z.array(z.string().uuid()).optional(),
});

export const createDispatchSchema = z.object({
  proformaInvoiceId: z.string().uuid(),
  vehicleNo: z.string().optional(),
  driverName: z.string().optional(),
  notes: z.string().optional(),
  confirm: z.boolean().default(true),
  lines: z.array(dispatchLineSchema).min(1),
});

export const dispatchSearchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["DRAFT", "DISPATCHED", "CANCEL_PENDING", "CANCELLED"]).optional(),
  customerId: z.string().uuid().optional(),
  proformaInvoiceId: z.string().uuid().optional(),
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

export const projectProposalPricingSchema = z.object({
  packageId: z.string().uuid(),
  connectionPhase: z.enum(["SINGLE_PHASE", "THREE_PHASE"]),
  inverterBrandCodes: z.array(z.string().min(1)).min(1),
  inverterUpgradeId: z.string().uuid().nullable().optional(),
  structureType: z.enum(["CUSTOM_FABRICATED", "PREFAB_C_CHANNEL", "MONO_RAIL"]),
  buildingType: z.enum(["APARTMENT", "BUNGALOW"]),
  extraFloors: z.coerce.number().int().min(0).default(0),
  ndcrAdditionalPanels: z.coerce.number().int().min(0).default(0),
  ndcrPanelWp: z.coerce.number().int().min(570).max(650).default(580),
  futureStructurePanels: z.coerce.number().int().min(0).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
});

export const createProjectProposalSchema = projectProposalPricingSchema.extend({
  customerName: z.string().min(2),
  customerMobile: z.string().min(10),
  shortAddress: z.string().optional(),
  salesUserId: z.string().uuid().optional(),
  proposalDate: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProjectProposalSchema = createProjectProposalSchema.omit({
  salesUserId: true,
});

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

export const rejectProjectProposalSchema = z.object({
  reason: z.string().min(3),
});

export const reviseProjectProposalSchema = updateProjectProposalSchema;

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
