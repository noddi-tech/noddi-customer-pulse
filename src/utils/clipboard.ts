import { Customer } from "@/hooks/segmentation";
import { toast } from "sonner";

export async function copyEmailsToClipboard(customers: Customer[]) {
  const emails = customers
    .map((c) => c.email)
    .filter((e) => e)
    .join(", ");

  try {
    await navigator.clipboard.writeText(emails);
    toast.success(`${customers.length} emails copied to clipboard`);
  } catch (error) {
    toast.error("Failed to copy emails to clipboard");
  }
}
