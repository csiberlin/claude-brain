import { z } from "zod";

export const categories = [
  "pattern",
  "debugging",
  "api",
  "config",
  "architecture",
  "general",
] as const;

export type Category = (typeof categories)[number];

export interface Entry {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: Category;
  project: string | null;
  created_at: string;
  updated_at: string;
}

export const SearchSchema = z.object({
  query: z.string().describe("Search terms: technical terms, library names, error messages, concepts"),
  project: z.string().optional().describe("Project identifier to scope results. Omit for all."),
  category: z.enum(categories).optional().describe("Filter by category"),
  limit: z.number().min(1).max(20).default(5).describe("Max results (default 5)"),
});

export const AddSchema = z.object({
  title: z.string().describe("Concise title summarizing the knowledge"),
  content: z.string().describe("The knowledge content. Be specific and actionable."),
  tags: z.array(z.string()).describe("Tags: technology names, concepts, error codes"),
  category: z.enum(categories).default("general"),
  project: z.string().optional().describe("Project identifier. Omit for general knowledge."),
});

export const UpdateSchema = z.object({
  id: z.number().describe("Entry ID to update"),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(categories).optional(),
  project: z.string().nullable().optional(),
});

export const DeleteSchema = z.object({
  id: z.number().describe("Entry ID to delete"),
});

export const ListTagsSchema = z.object({
  project: z.string().optional().describe("Filter tags by project. Omit for all."),
});

export const ConsolidateSchema = z.object({
  apply: z.boolean().default(false).describe("false = dry-run (show candidates), true = merge duplicates into general knowledge"),
  min_projects: z.number().min(2).default(2).describe("Min projects an entry must appear in to be a candidate (default 2)"),
});

export const SleepSchema = z.object({
  project: z.string().optional().describe("Project identifier. Auto-detected if omitted."),
});
