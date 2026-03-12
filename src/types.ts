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
  limit: z.number().min(1).max(20).default(5).describe("Max results (default 5)"),
  detail: z.enum(["brief", "full"]).default("brief").describe("'brief' returns snippets (default), 'full' returns complete content"),
});

export const AddSchemaBase = z.object({
  title: z.string().describe("Concise, searchable title"),
  content: z.string().describe("The knowledge content. Be specific and actionable."),
  tags: z.array(z.string()).describe("Tags: technology names, concepts, error codes"),
  category: z.enum(categories).default("pattern"),
  project: z.string().optional().describe("Project identifier. Omit for general knowledge."),
  source: z.string().optional().describe("Where this knowledge comes from: file path, URL, library name"),
  source_type: z.enum(sourceTypes).optional().describe("Trust level: docs, code, verified, research, inferred"),
});

export const AddSchema = AddSchemaBase.refine(
  (d) => !d.source_type || d.source,
  { message: "source is required when source_type is set", path: ["source"] }
);

export const UpdateSchema = z.object({
  id: z.number().describe("Entry ID to update"),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(categories).optional(),
  project: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  source_type: z.enum(sourceTypes).nullable().optional(),
});

export const DeleteSchema = z.object({
  id: z.number().describe("Entry ID to delete"),
});

export const ListTagsSchema = z.object({
  project: z.string().optional().describe("Filter tags by project. Omit for all."),
});

export const ConsolidateReviewSchema = z.object({
  project: z.string().optional().describe("Project identifier. Auto-detected if omitted."),
  full: z.boolean().default(false).describe("Force full review instead of targeted"),
});

export const DeduplicateSchema = z.object({
  apply: z.boolean().default(false).describe("false = dry-run (show candidates), true = merge duplicates into general knowledge"),
  min_projects: z.number().min(2).default(2).describe("Min projects an entry must appear in to be a candidate (default 2)"),
});

export const StatsSchema = z.object({
  project: z.string().optional().describe("Filter stats by project. Omit for all."),
});
