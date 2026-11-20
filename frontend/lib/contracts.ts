export type UserRole = "USER" | "SUPPORT_AGENT" | "TEAM_LEAD" | "ADMIN";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export type TicketCategory =
  | "INCIDENT"
  | "SERVICE_REQUEST"
  | "ACCESS_REQUEST"
  | "HARDWARE"
  | "SOFTWARE"
  | "NETWORK"
  | "OTHER";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Ticket {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}
