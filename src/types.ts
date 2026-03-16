import { z } from "zod";

export const categories = ["map", "decision", "pattern", "api"] as const;

export type Category = (typeof categories)[number];

export const sourceTypes = ["docs", "code", "verified", "research", "inferred"] as const;
export type SourceType = (typeof sourceTypes)[number];

export interface Entry {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: Category;
  project: string | null;
  source: string | null;
  source_type: SourceType | null;
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number;
}

export const SearchSchema = z.object({
  query: z.string().describe("Search terms: technical terms, library names, error messages, concepts"),
  project: z.string().optional().describe("Project identifier to scope results. Omit for all."),
  category: z.enum(categories).optional().describe("Filter by category"),
  limit: z.number().min(1).max(5).default(5).describe("Max results (default 5)"),
  detail: z.enum(["brief", "full"]).default("brief").describe("'brief' returns snippets (default), 'full' returns complete content"),
});

export const UpsertSchema = z.object({
  id: z.number().optional().describe("Entry ID to update. Omit to create new entry."),
  title: z.string().optional().describe("Concise, searchable title (required for new entries)"),
  content: z.string().optional().describe("The knowledge content (required for new entries)"),
  tags: z.array(z.string()).optional().describe("Tags: technology names, concepts, error codes (required for new entries)"),
  category: z.enum(categories).optional().describe("Entry category (default: pattern for new entries)"),
  project: z.string().nullable().optional().describe("Project identifier. Omit for auto-detect, null for general."),
  source: z.string().nullable().optional().describe("Where this knowledge comes from"),
  source_type: z.enum(sourceTypes).nullable().optional().describe("Trust level: docs, code, verified, research, inferred"),
});

export const DeleteSchema = z.object({
  id: z.number().describe("Entry ID to delete"),
});

export const InfoSchema = z.object({
  project: z.string().optional().describe("Filter by project. Omit for all."),
  include_tags: z.boolean().default(false).describe("Include tag listing with counts"),
});

export const MaintainSchema = z.object({
  project: z.string().optional().describe("Project identifier. Auto-detected if omitted."),
  full: z.boolean().default(false).describe("Force full review instead of targeted"),
  deduplicate: z.boolean().default(false).describe("Also run cross-project deduplication"),
  apply_dedup: z.boolean().default(false).describe("Actually merge duplicates (false = dry-run)"),
  min_projects: z.number().min(2).default(2).describe("Min projects for dedup candidates (default 2)"),
});

