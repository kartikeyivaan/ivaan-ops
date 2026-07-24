import { ServicePriority, ServiceSystemStatus } from "@prisma/client";
import { isValidIndianMobile } from "@/lib/service";

/**
 * Client-side form state for the New Service Request form. All values are held
 * as strings/booleans for controlled inputs; conversion happens when building
 * the API payload.
 */
export type NewServiceRequestFormValues = {
  customerName: string;
  mobileNumber: string;
  consumerNumber: string;
  workTypeId: string;
  customWorkType: string;
  customerRequest: string;
  priority: ServicePriority;
  assignedToUserId: string;
  // Add Customer Details
  alternateMobileNumber: string;
  installationAddress: string;
  cityOrVillage: string;
  landmark: string;
  // Add More Details
  targetCompletionDate: string;
  complaintSource: string;
  systemStatus: ServiceSystemStatus;
  isChargeable: boolean;
  totalFees: string;
  internalNote: string;
  attachmentUrl: string;
  attachmentName: string;
};

export function defaultNewServiceRequestValues(): NewServiceRequestFormValues {
  return {
    customerName: "",
    mobileNumber: "",
    consumerNumber: "",
    workTypeId: "",
    customWorkType: "",
    customerRequest: "",
    priority: ServicePriority.NORMAL,
    assignedToUserId: "",
    alternateMobileNumber: "",
    installationAddress: "",
    cityOrVillage: "",
    landmark: "",
    targetCompletionDate: "",
    complaintSource: "",
    systemStatus: ServiceSystemStatus.NOT_CHECKED,
    isChargeable: false,
    totalFees: "",
    internalNote: "",
    attachmentUrl: "",
    attachmentName: "",
  };
}

export type NewServiceRequestErrors = Partial<
  Record<keyof NewServiceRequestFormValues, string>
>;

/** Pure validation for the mandatory + format rules (PRD §6). */
export function validateNewServiceRequest(
  values: NewServiceRequestFormValues,
): NewServiceRequestErrors {
  const errors: NewServiceRequestErrors = {};

  if (values.customerName.trim().length < 2) {
    errors.customerName = "Customer name is required.";
  }

  if (!values.mobileNumber.trim()) {
    errors.mobileNumber = "Mobile number is required.";
  } else if (!isValidIndianMobile(values.mobileNumber)) {
    errors.mobileNumber = "Enter a valid 10-digit mobile number.";
  }

  if (
    values.alternateMobileNumber.trim() &&
    !isValidIndianMobile(values.alternateMobileNumber)
  ) {
    errors.alternateMobileNumber = "Enter a valid 10-digit mobile number.";
  }

  if (!values.workTypeId.trim() && !values.customWorkType.trim()) {
    errors.workTypeId = "Select a work type.";
  }

  if (values.customerRequest.trim().length < 2) {
    errors.customerRequest = "Customer request is required.";
  }

  if (values.totalFees.trim()) {
    const fees = Number(values.totalFees);
    if (Number.isNaN(fees) || fees < 0) {
      errors.totalFees = "Enter a valid amount.";
    }
  }

  return errors;
}

/**
 * Convert form values into the JSON payload accepted by
 * createServiceRequestSchema. Empty optional values are omitted so server
 * defaults apply.
 */
export function buildCreateServiceRequestPayload(
  values: NewServiceRequestFormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customerName: values.customerName.trim(),
    mobileNumber: values.mobileNumber.trim(),
    customerRequest: values.customerRequest.trim(),
    priority: values.priority,
    systemStatus: values.systemStatus,
    isChargeable: values.isChargeable,
  };

  const optionalStrings: [keyof NewServiceRequestFormValues, string][] = [
    ["consumerNumber", "consumerNumber"],
    ["customWorkType", "customWorkType"],
    ["alternateMobileNumber", "alternateMobileNumber"],
    ["installationAddress", "installationAddress"],
    ["cityOrVillage", "cityOrVillage"],
    ["landmark", "landmark"],
    ["internalNote", "internalNote"],
    ["attachmentUrl", "attachmentUrl"],
    ["attachmentName", "attachmentName"],
    ["targetCompletionDate", "targetCompletionDate"],
    ["complaintSource", "complaintSource"],
    ["workTypeId", "workTypeId"],
    ["assignedToUserId", "assignedToUserId"],
  ];

  for (const [field, key] of optionalStrings) {
    const raw = values[field];
    if (typeof raw === "string" && raw.trim()) {
      payload[key] = raw.trim();
    }
  }

  if (values.totalFees.trim()) {
    payload.totalFees = Number(values.totalFees);
  }

  return payload;
}
