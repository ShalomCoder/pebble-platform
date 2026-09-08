export type CurrencyCode = "GHS" | "USD" | "EUR" | "GBP";
export type TransactionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type TransactionDirection = "sent" | "received" | "self";

export type SerializedTransaction = {
  id: string;
  accountId: string;
  reference: string;
  amount: number;
  currency: CurrencyCode;
  status: TransactionStatus;
  memo: string | null;
  direction: TransactionDirection;
  senderWallet: { id: string; address: string; name: string; accountName: string };
  recipientWallet: { id: string; address: string; name: string; accountName: string };
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failedReason: string | null;
  completionAcknowledgedAt: string | null;
  needsAcknowledgement: boolean;
};

export type SerializedWallet = {
  id: string;
  address: string;
  name: string;
  currency: CurrencyCode;
  balance: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type SerializedUser = { id: string; fullName: string; email: string; createdAt: string };

export type SerializedAccountOverview = {
  account: { id: string; publicCode: string; status: string };
  user: SerializedUser;
  wallets: SerializedWallet[];
};

export type SerializedCard = {
  id: string;
  walletId: string;
  walletName: string;
  walletAddress: string;
  lastFour: string;
  cardType: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  expiresAt: string;
};

export type TransactionListResult = {
  items: SerializedTransaction[];
  total: number;
  page: number;
  pageSize: number;
};

export type TransferIntentResponse = {
  mode: "new" | "resume" | "replay";
  transaction: SerializedTransaction;
};