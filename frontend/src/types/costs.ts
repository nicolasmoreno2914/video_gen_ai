export interface CostBreakdown {
  openai_text: number;
  openai_images: number;
  elevenlabs: number;
  render: number;
  youtube: number;
}

export interface CostUsage {
  text_tokens_input: number;
  text_tokens_output: number;
  images_generated: number;
  elevenlabs_characters: number;
  render_seconds: number;
  youtube_uploads: number;
}

export interface CostSummary {
  total_cost: number;
  total_videos: number;
  average_cost_per_video: number;
  total_duration_seconds: number;
  breakdown: CostBreakdown;
  usage: CostUsage;
}

export interface VideoCostItem {
  job_id: string;
  title: string;
  created_at: string;
  status: string;
  duration_seconds: number | null;
  scenes_count: number | null;
  ai_images_count: number;
  total_cost: number;
  breakdown: CostBreakdown;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface VideoCostsResponse {
  items: VideoCostItem[];
  pagination: Pagination;
}

export interface UsageLog {
  provider: string;
  operation: string;
  model_name: string;
  unit_type: string;
  input_units: number;
  output_units: number;
  estimated_cost: number;
  created_at: string;
}

export interface VideoCostDetail {
  job_id: string;
  title: string;
  status: string;
  duration_seconds: number;
  scenes_count: number;
  estimated_total_cost: number;
  cost_per_minute: number;
  cost_per_scene: number;
  breakdown: CostBreakdown;
  usage_logs: UsageLog[];
}

export interface DailyCostEntry {
  date: string;
  total_cost: number;
  videos_count: number;
  openai_text: number;
  openai_images: number;
  elevenlabs: number;
  render: number;
}

export interface ProviderBreakdownItem {
  provider: string;
  operation: string;
  total_cost: number;
  total_input_units: number;
  total_output_units: number;
  count: number;
}

export type DateRange = '7d' | '30d' | 'today' | 'month';

export interface DateFilter {
  from: string;
  to: string;
  label: string;
}

export interface VideoCostsParams {
  from: string;
  to: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
