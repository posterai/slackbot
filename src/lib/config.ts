import { z } from "zod";

/**
 * Parses env lazily and caches the result, so `next build` (which imports the route
 * without runtime secrets) doesn't fail, and a missing variable fails on first use
 * with every problem listed.
 */
export function defineConfig<S extends z.ZodRawShape>(name: string, shape: S) {
  let cached: z.infer<z.ZodObject<S>> | undefined;
  return (): z.infer<z.ZodObject<S>> => {
    if (cached) return cached;
    const result = z.object(shape).safeParse(process.env);
    if (!result.success) {
      const problems = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid ${name} config: ${problems}`);
    }
    cached = result.data;
    return cached;
  };
}

/** Comma-separated list → trimmed, non-empty entries. */
export const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

export const githubConfig = defineConfig("GitHub App", {
  GITHUB_APP_ID: z.string().min(1),
  // Vercel env vars can't hold real newlines reliably; accept "\n"-escaped PEMs too.
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((s) => s.replace(/\\n/g, "\n")),
  GITHUB_APP_INSTALLATION_ID: z.coerce.number().int().positive(),
});
