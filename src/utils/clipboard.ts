import { Customer } from "@/hooks/segmentation";
import { toast } from "sonner";

export async function copyEmailsToClipboard(customers: Customer[]) {
  // For B2C customers, we don't have direct email access
  // This function is deprecated for user_group-based customer tracking
  toast.info("Email export not available for user groups");
}
