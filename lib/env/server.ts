import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("lib/env/server.ts must not be imported from client code.");
}

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  SEARCH_API_KEY: z.string().optional(),
  SEARCH_CX: z.string().optional(),
  SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),
  RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE: z
    .string()
    .regex(/^\d+$/)
    .optional(),
});

export const serverEnv = serverEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SEARCH_API_KEY: process.env.SEARCH_API_KEY,
  SEARCH_CX: process.env.SEARCH_CX,
  SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY,
  RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE:
    process.env.RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE,
  RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE:
    process.env.RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE,
});

