import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export type Manager = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  position: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  manager_id: string;
  client_name: string | null;
  client_company: string | null;
  type: "call" | "meeting";
  status: "pending" | "analyzing" | "analyzed" | "failed";
  date: string;
  duration_seconds: number | null;
  service: string | null;
  tags: string[] | null;
  transcript: string | null;
  created_at: string;
};

export type AiAnalysis = {
  id: string;
  conversation_id: string;
  score: number;
  summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  recommendations: string[] | null;
  created_at: string;
};
