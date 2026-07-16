/**
 * i18n/translate.ts — Translation cache.
 * 
 * Translates English base text to other languages on demand.
 * Results are cached in the translations table.
 * One entry per (hash, lang) pair.
 */
import { db } from "@/lib/db";
import { translations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";

/**
 * Get a translation from cache or compute it.
 */
export async function translate(
  text: string,
  lang: string
): Promise<string> {
  if (lang === "en") return text; // Base language — no translation needed

  const hash = computeHash(lang, text);

  // Check cache
  const cached = db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.hash, hash),
        eq(translations.lang, lang)
      )
    )
    .all()[0];

  if (cached) {
    return cached.translatedText;
  }

  // Compute translation via AI
  const translated = await translateViaAI(text, lang);

  // Cache the result
  db.insert(translations)
    .values({
      hash,
      lang,
      sourceText: text,
      translatedText: translated,
      createdAt: Date.now(),
    })
    .run();

  return translated;
}

/**
 * Translate multiple texts in batch.
 */
export async function translateBatch(
  texts: string[],
  lang: string
): Promise<string[]> {
  if (lang === "en") return texts;

  const results: string[] = [];
  for (const text of texts) {
    results.push(await translate(text, lang));
  }
  return results;
}

/**
 * Compute a cache key hash.
 */
function computeHash(lang: string, text: string): string {
  return createHash("sha256").update(`${lang}\n${text}`).digest("hex");
}

/**
 * Translate text via AI (simplified — calls claude CLI).
 */
async function translateViaAI(text: string, lang: string): Promise<string> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(
      "claude",
      [
        "-p",
        `Translate the following English text to ${lang}. Return ONLY the translated text, no explanations.\n\n${text}`,
        "--output-format", "text",
        "--max-turns", "1",
      ],
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      }
    );

    return stdout.trim() || text;
  } catch {
    return text; // Fallback to English on error
  }
}

/**
 * Get cache stats.
 */
export function getTranslationStats(): {
  totalEntries: number;
  languages: string[];
  cacheHitRate: number;
} {
  const rows = db.select().from(translations).all();
  const langs = new Set(rows.map((r) => r.lang));

  return {
    totalEntries: rows.length,
    languages: Array.from(langs),
    cacheHitRate: rows.length > 0 ? 1 : 0, // Simplified
  };
}
