import { z } from "zod";
import {
  ServiceComplaintSource,
  ServiceCompletionSystemStatus,
  ServiceContactMode,
  ServiceCustomerConfirmation,
  ServicePaymentMode,
  ServicePriority,
  ServiceStatus,
  ServiceSystemStatus,
  ServiceUpdateType,
  ServiceVisitStatus,
  ServiceWaitingReason,
} from "@prisma/client";
import { isValidIndianMobile } from "@/lib/service";

const trimmedString = z.string().trim();
const optionalText = trimmedString.max(2000).optional().or(z.literal(""));
const shortText = trimmedString.max(255).optional().or(z.literal(""));

const mobileField = trimmedString.refine(isValidIndianMobile, {
  message: "Enter a valid 10-digit mobile number.",
});

const optionalMobileField = trimmedString
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || isValidIndianMobile(value), {
    message: "Enter a valid 10-digit mobile number.",
  });

const moneyField = z.coerce.number().min(0, "Amount cannot be negative.");
const optionalDate = z.coerce.date().optional();

/** Work type reference: either a master id or a custom "Other" text is required. */
const workTypeRef = {
  workTypeId: z.string().uuid().optional(),
  customWorkType: shortText,
};

export const createServiceRequestSchema = z
  .object({
    customerName: trimmedString.min(2, "Customer name is required."),
    mobileNumber: mobileField,
    consumerNumber: shortText,
    customerRequest: trimmedString.min(2, "Customer request is required."),
    priority: z.nativeEnum(ServicePriority).default(ServicePriority.NORMAL),
    assignedToUserId: z.string().uuid().optional().nullable(),
    ...workTypeRef,

    // Collapsed: Add Customer Details
    alternateMobileNumber: optionalMobileField,
    installationAddress: optionalText,
    cityOrVillage: shortText,
    landmark: shortText,

    // Collapsed: Add More Details
    targetCompletionDate: optionalDate,
    complaintSource: z.nativeEnum(ServiceComplaintSource).optional(),
    systemStatus: z
      .nativeEnum(ServiceSystemStatus)
      .default(ServiceSystemStatus.NOT_CHECKED),
    isChargeable: z.boolean().default(false),
    totalFees: moneyField.optional(),
    internalNote: optionalText,
    attachmentUrl: shortText,
    attachmentName: shortText,
  })
  .refine((data) => Boolean(data.workTypeId) || Boolean(data.customWorkType), {
    message: "Select a work type.",
    path: ["workTypeId"],
  });

export const updateServiceRequestSchema = z
  .object({
    customerName: trimmedString.min(2).optional(),
    mobileNumber: optionalMobileField,
    consumerNumber: shortText,
    customerRequest: trimmedString.min(2).optional(),
    priority: z.nativeEnum(ServicePriority).optional(),
    ...workTypeRef,
    alternateMobileNumber: optionalMobileField,
    installationAddress: optionalText,
    cityOrVillage: shortText,
    landmark: shortText,
    targetCompletionDate: optionalDate.nullable(),
    complaintSource: z.nativeEnum(ServiceComplaintSource).optional().nullable(),
    systemStatus: z.nativeEnum(ServiceSystemStatus).optional(),
    isChargeable: z.boolean().optional(),
    totalFees: moneyField.optional(),
    internalNote: optionalText,
  })
  .strict();

export const assignServiceSchema = z.object({
  // null clears the assignment (back to unassigned)
  assignedToUserId: z.string().uuid().optional().nullable(),
  targetCompletionDate: optionalDate.nullable(),
  note: optionalText,
});

export const changeServiceStatusSchema = z.object({
  status: z.nativeEnum(ServiceStatus),
  note: optionalText,
  waitingReason: z.nativeEnum(ServiceWaitingReason).optional().nullable(),
  nextActionDate: optionalDate.nullable(),
});

export const addServiceUpdateSchema = z.object({
  updateType: z.nativeEnum(ServiceUpdateType),
  note: optionalText,
  nextActionDate: optionalDate.nullable(),
  // Customer Contacted
  contactMode: z.nativeEnum(ServiceContactMode).optional().nullable(),
  // Visit Scheduled
  visitDate: optionalDate.nullable(),
  visitTime: shortText,
  assignedExecutiveId: z.string().uuid().optional().nullable(),
  // Site Visit Completed
  visitStatus: z.nativeEnum(ServiceVisitStatus).optional().nullable(),
  visitResult: optionalText,
  furtherWorkRequired: z.boolean().optional(),
  // Material Required
  materialDetails: optionalText,
  // Attachment (reference only in V1)
  attachmentUrl: shortText,
  attachmentName: shortText,
});

export const recordServicePaymentSchema = z.object({
  amount: z.coerce.number().positive("Enter a payment amount greater than zero."),
  paymentMode: z.nativeEnum(ServicePaymentMode),
  paymentDate: z.coerce.date(),
  reference: shortText,
});

export const completeServiceSchema = z.object({
  workCompleted: trimmedString.min(2, "Describe the work completed."),
  completionDate: z.coerce.date(),
  systemStatusAfterWork: z.nativeEnum(ServiceCompletionSystemStatus),
  customerConfirmation: z.nativeEnum(ServiceCustomerConfirmation).optional().nullable(),
  furtherWorkRequired: z.boolean().default(false),
  attachmentUrl: shortText,
  attachmentName: shortText,
});

export const closeServiceSchema = z.object({
  note: optionalText,
});

export const reopenServiceSchema = z.object({
  reason: trimmedString.min(2, "A reason is required to reopen."),
  targetStatus: z.nativeEnum(ServiceStatus).optional(),
});

export const cancelServiceSchema = z.object({
  reason: trimmedString.min(2, "A cancellation reason is required."),
});

export const SERVICE_QUICK_FILTERS = [
  "my",
  "unassigned",
  "open",
  "in_progress",
  "waiting",
  "delayed",
  "completed",
  "closed",
] as const;

export const SERVICE_SORT_FIELDS = [
  "requestDate",
  "updatedAt",
  "targetCompletionDate",
  "priority",
  "status",
  "customerName",
  "pendingAmount",
] as const;

export const serviceListQuerySchema = z.object({
  q: trimmedString.optional(),
  quickFilter: z.enum(SERVICE_QUICK_FILTERS).optional(),
  status: z.nativeEnum(ServiceStatus).optional(),
  priority: z.nativeEnum(ServicePriority).optional(),
  workTypeId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
  paymentPending: z.coerce.boolean().optional(),
  dateFrom: optionalDate,
  dateTo: optionalDate,
  sortBy: z.enum(SERVICE_SORT_FIELDS).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const serviceWorkTypeCreateSchema = z.object({
  name: trimmedString.min(2, "Work type name is required."),
  defaultTargetDays: z.coerce.number().int().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const serviceWorkTypeUpdateSchema = z
  .object({
    name: trimmedString.min(2).optional(),
    defaultTargetDays: z.coerce.number().int().min(0).optional().nullable(),
    isActive: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const serviceWorkTypeReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const duplicateCheckSchema = z.object({
  mobileNumber: trimmedString.optional(),
  consumerNumber: trimmedString.optional(),
});

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequestInput = z.infer<typeof updateServiceRequestSchema>;
export type AddServiceUpdateInput = z.infer<typeof addServiceUpdateSchema>;
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;
