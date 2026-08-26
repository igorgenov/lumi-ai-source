export type UserRole = "admin" | "manager";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  position: string;
  teamId?: string;
  createdAt: string;
}

export type ConversationType = "call" | "meeting";
export type ConversationStatus = "analyzed" | "pending" | "failed";
export type CallResult = "success" | "rejected" | "no_answer" | "callback" | "transferred";

export interface CallMetadata {
  phone: string;
  duration: number; // seconds
  direction: "inbound" | "outbound";
  result: CallResult;
  ringostatCallId: string;
}

export interface MeetingMetadata {
  googleMeetLink: string;
  googleDriveFileId: string;
  duration: number;
  participants: string[];
}

export interface AIAnalysis {
  score: number; // 0-100
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  topics: string[];
  sentiment: "positive" | "neutral" | "negative";
  talkRatio: { manager: number; client: number }; // percent
  objectionHandling: number; // 0-100
  needsIdentification: number; // 0-100
  closingSkills: number; // 0-100
}

export interface Conversation {
  id: string;
  managerId: string;
  managerName: string;
  clientName: string;
  clientCompany?: string;
  type: ConversationType;
  status: ConversationStatus;
  date: string;
  transcript?: string;
  aiAnalysis?: AIAnalysis;
  callMetadata?: CallMetadata;
  meetingMetadata?: MeetingMetadata;
  tags: string[];
  service: "SEO" | "GEO" | "PPC" | "Analytics" | "ASO" | "ASA" | "Nonprofit";
}

export interface ManagerStats {
  totalConversations: number;
  avgScore: number;
  successRate: number;
  avgCallDuration: number;
  totalCalls: number;
  totalMeetings: number;
  weeklyTrend: number; // percent change
  monthlyScores: { month: string; score: number }[];
  serviceDistribution: { service: string; count: number }[];
}

export interface Manager extends User {
  stats: ManagerStats;
  coachingNotes?: string;
}

export interface DashboardStats {
  totalConversations: number;
  avgTeamScore: number;
  successRate: number;
  pendingAnalysis: number;
  weeklyChange: {
    conversations: number;
    score: number;
    successRate: number;
  };
  topManagers: { id: string; name: string; score: number; trend: number; topService: string; avatarUrl?: string }[];
  recentActivity: {
    id: string;
    managerName: string;
    type: ConversationType;
    clientName: string;
    score: number;
    date: string;
  }[];
  scoreDistribution: { range: string; count: number }[];
  weeklyConversations: { day: string; calls: number; meetings: number }[];
  serviceStats: { service: string; count: number; avgScore: number }[];
}
