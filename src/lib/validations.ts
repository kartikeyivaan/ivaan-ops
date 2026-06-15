import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
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
  mobile: z.string().optional(),
  password: z.string().min(8).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  roleIds: z.array(z.string().uuid()).min(1),
  companyIds: z.array(z.string().uuid()).min(1),
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
  customerName: z.string().min(2, "Customer name is required"),
  customerType: z.enum(["DEALER", "PROJECT"]),
  gstNumber: z.string().min(15, "GST number is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
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
