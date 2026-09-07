import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { TransactionStatus } from "@/lib/client/types";

const STATUS_STYLE: Record<TransactionStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PENDING: { label: "Pending", variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "default" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export function TransactionStatusBadge({ status, className }: { status: TransactionStatus; className?: string }) {
  const cfg = STATUS_STYLE[status];
  return (
    <Badge variant={cfg.variant} className={cn(className)}>
      {cfg.label}
    </Badge>
  );
}

const DIRECTION_LABEL: Record<string, string> = {
  sent: "Sent",
  received: "Received",
  self: "Self transfer",
};

export function DirectionLabel({ direction }: { direction: "sent" | "received" | "self" }) {
  return DIRECTION_LABEL[direction];
}