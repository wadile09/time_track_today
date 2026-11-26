import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ClueItem, sanitizeClueText } from "@/app/bollywood-guess/characters";

// Read API keys from process.env OR dynamically from .env.local so updates work without server restart
function getEnvKey(name: string): string | undefined {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
      if (match?.[1]) {
        return match[1].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {
    // ignore read error
  }
  return undefined;
}

// Track recently asked questions in memory so the AI never repeats them
const globalForClues = globalThis as unknown as {
  __bollywoodUsedClues?: string[];
};
const recentGlobalClues = (globalForClues.__bollywoodUsedClues ??= []);

function rememberClues(clues: ClueItem[]) {
  for (const c of clues) {
    recentGlobalClues.push(c.question.trim().toLowerCase());
  }
  if (recentGlobalClues.length > 300) {
    recentGlobalClues.splice(0, recentGlobalClues.length - 300);
  }
}

interface AIGenerationResult {
  clues: ClueItem[];
  aliases: string[];
  provider: string;
}

let lastProviderError = "";

function buildPrompt(characterName: string, excludeQuestions: string[]): string {
  const recentExcludes = excludeQuestions.slice(-25);
  return [
    `You are a witty, hilarious Indian cinema & Bollywood quizmaster AI hosting a 2-player guessing game.`,
    `Player 1 secretly picked this Bollywood character or celebrity: "${characterName}".`,
    `Generate exactly 5 UNIQUE, super funny, clever clue questions with hilarious bilingual (Hindi + English) hints so Player 2 can guess who "${characterName}" is.`,
    ``,
    `STYLE & LANGUAGE RULES:`,
    `- Write each "question" in funny, punchy English (or Hinglish) with full Bollywood masala and emojis.`,
    `- Write EVERY "hint" in a hilarious mix of BOTH English AND Hindi (using fun Hindi in Devanagari script + witty English together, e.g. "He ignores every medical rule and prescribes a giant hug — बोले तो, दवा-दारू छोड़ो, बस एक 'जादू की झप्पी' ले लो! 😂").`,
    `- Keep the humor dramatic, meme-worthy, and laugh-out-loud funny!`,
    ``,
    `STRICT RULES:`,
    `1. NEVER reveal, include, or mention "${characterName}", their first name, last name, initials, or letter count in ANY question or hint (neither in English nor in Hindi!).`,
    `2. Every question and hint MUST be uniquely tailored to "${characterName}" (their real movies, iconic character scenes, famous dialogues, quirks, fashion, co-stars, or unforgettable moments). Never write generic filler.`,
    `3. Order the 5 clues from subtle/funny (Clue 1) to more recognizable (Clue 5), while keeping the character name secret.`,
    `4. NEVER repeat or paraphrase any of these already-used questions: ${recentExcludes.length ? recentExcludes.join(" | ") : "none"}.`,
    `5. Also provide "aliases": an array of 3-6 lowercase acceptable answers (common spellings, full name, famous nickname/character name).`,
    `6. Respond with ONLY valid JSON (no markdown, no explanation) in this exact schema:`,
    `{ "aliases": ["..."], "clues": [ { "question": "...", "hint": "..." }, ... ] }`,
  ].join("\n");
}

function parseAIResponse(raw: unknown, characterName: string): { clues: ClueItem[]; aliases: string[] } | null {
  if (typeof raw !== "string") return null;
  try {
    const cleaned = raw.replace(/```json|```/gi, "").trim();
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");

    let cluesRaw: unknown[] = [];
    let aliasesRaw: unknown[] = [];

    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
      const objEnd = cleaned.lastIndexOf("}");
      if (objEnd === -1) return null;
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      cluesRaw = Array.isArray(parsed?.clues) ? parsed.clues : [];
      aliasesRaw = Array.isArray(parsed?.aliases) ? parsed.aliases : [];
    } else if (arrStart !== -1) {
      const arrEnd = cleaned.lastIndexOf("]");
      if (arrEnd === -1) return null;
      cluesRaw = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    } else {
      return null;
    }

    const clues: ClueItem[] = cluesRaw
      .slice(0, 5)
      .filter(
        (x): x is { question: string; hint: string } =>
          !!x &&
          typeof (x as { question?: unknown }).question === "string" &&
          typeof (x as { hint?: unknown }).hint === "string"
      )
      .map((x) => ({
        question: sanitizeClueText(x.question.trim(), characterName),
        hint: sanitizeClueText(x.hint.trim(), characterName),
      }));

    if (clues.length !== 5) return null;

    const aliases = Array.from(
      new Set([
        characterName.trim().toLowerCase(),
        ...aliasesRaw
          .filter((a): a is string => typeof a === "string" && a.trim().length >= 2)
          .map((a) => a.trim().toLowerCase()),
      ])
    );

    return { clues, aliases };
  } catch {
    return null;
  }
}

async function discoverGeminiFlashModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data?.models || []) as Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
    const blockedTerms = [
      "omni", "exp", "tts", "audio", "image", "imagen", "embedding",
      "robotics", "computer-use", "deep-research", "veo", "lyria", "aqa",
    ];
    return models
      .filter((m) => {
        if (!m.name || !m.supportedGenerationMethods?.includes("generateContent")) return false;
        const lower = m.name.toLowerCase();
        if (!lower.includes("gemini") && !lower.includes("gemma-3")) return false;
        return !blockedTerms.some((term) => lower.includes(term));
      })
      .map((m) => m.name!.replace(/^models\//, ""))
      .sort((a, b) => {
        // Prefer standard gemini flash models first, then gemma-3, then others
        const score = (name: string) => {
          if (name.includes("flash-lite")) return 1;
          if (name.includes("flash")) return 0;
          if (name.includes("gemma-3-27b")) return 2;
          if (name.includes("gemma-3")) return 3;
          return 4;
        };
        const sa = score(a);
        const sb = score(b);
        if (sa !== sb) return sa - sb;
        return b.localeCompare(a);
      })
      .slice(0, 8);
  } catch {
    return [];
  }
}

function getGeminiKeys(): string[] {
  const rawKeys = [
    getEnvKey("GEMINI_API_KEY"),
    getEnvKey("GOOGLE_API_KEY"),
    getEnvKey("GEMINI_API_KEY_2"),
    getEnvKey("GEMINI_API_KEY_3"),
  ].filter((k): k is string => Boolean(k));

  const keys: string[] = [];
  for (const raw of rawKeys) {
    for (const part of raw.split(",")) {
      const clean = part.trim();
      if (clean && !keys.includes(clean)) keys.push(clean);
    }
  }
  return keys;
}

async function generateWithGemini(prompt: string, characterName: string): Promise<AIGenerationResult | null> {
  const apiKeys = getGeminiKeys();
  if (apiKeys.length === 0) return null;

  const defaultModels = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemma-3-27b-it",
  ];
  const glUrl = (m: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

  const attemptErrors: string[] = [];

  for (const apiKey of apiKeys) {
    let sawValidEndpointResponse = false;

    const tryCall = async (buildUrl: (m: string) => string, model: string): Promise<AIGenerationResult | null> => {
      try {
        const isGemma = model.toLowerCase().includes("gemma");
        const generationConfig: Record<string, unknown> = { temperature: 1.0 };
        if (!isGemma) {
          generationConfig.responseMimeType = "application/json";
        }

        const res = await fetch(buildUrl(model), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
          }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
          if (res.status === 429 || res.status >= 500) {
            sawValidEndpointResponse = true;
          }
          attemptErrors.push(`${model} (${res.status}): ${errMsg}`);
          console.warn(`[clues/gemini] ${model} failed (${res.status}):`, errMsg);
          return null;
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = parseAIResponse(text, characterName);
        if (parsed) {
          return { ...parsed, provider: `gemini (${model})` };
        }
        sawValidEndpointResponse = true;
        attemptErrors.push(`${model}: AI response was not valid 5-clue JSON`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error calling Gemini";
        attemptErrors.push(`${model}: ${msg}`);
        console.warn(`[clues/gemini] ${model} error:`, err);
      }
      return null;
    };

    const primaryRes = await tryCall(glUrl, defaultModels[0]);
    if (primaryRes) return primaryRes;

    const discovered = await discoverGeminiFlashModels(apiKey);
    const candidateModels = Array.from(new Set([...defaultModels.slice(1), ...discovered])).filter(
      (m) => m !== defaultModels[0]
    );

    for (const model of candidateModels.slice(0, 6)) {
      const res = await tryCall(glUrl, model);
      if (res) return res;
    }

    if (!sawValidEndpointResponse) {
      const vertexUrl = (m: string) =>
        `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent`;
      const vertexRes = await tryCall(vertexUrl, "gemini-3.5-flash");
      if (vertexRes) return vertexRes;
    }
  }

  const preferredError =
    attemptErrors.find((e) => e.includes("(429)") || e.includes("quota") || e.includes("JSON")) ||
    attemptErrors[0] ||
    "Unknown Gemini error";
  lastProviderError = `Gemini: ${preferredError}`;

  return null;
}

async function generateWithOpenAICompatible(prompt: string, characterName: string): Promise<AIGenerationResult | null> {
  const groqKey = getEnvKey("GROQ_API_KEY");
  const openAiKey = getEnvKey("OPENAI_API_KEY");
  const openRouterKey = getEnvKey("OPENROUTER_API_KEY");

  const configs: Array<{ url: string; key: string; model: string; name: string }> = [];
  if (groqKey) {
    configs.push(
      {
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        model: "llama-3.3-70b-versatile",
        name: "groq (llama-3.3-70b)",
      },
      {
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groqKey,
        model: "llama-3.1-8b-instant",
        name: "groq (llama-3.1-8b)",
      }
    );
  }
  if (openRouterKey) {
    configs.push(
      {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: openRouterKey,
        model: getEnvKey("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free",
        name: "openrouter (llama-3.3-70b:free)",
      },
      {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: openRouterKey,
        model: "google/gemma-3-27b-it:free",
        name: "openrouter (gemma-3-27b:free)",
      }
    );
  }
  if (openAiKey) {
    configs.push({
      url: "https://api.openai.com/v1/chat/completions",
      key: openAiKey,
      model: "gpt-4o-mini",
      name: "openai (gpt-4o-mini)",
    });
  }

  for (const cfg of configs) {
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.key}`,
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          model: cfg.model,
          temperature: 1.0,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        if (!lastProviderError) lastProviderError = `${cfg.name}: ${errMsg}`;
        continue;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      const parsed = parseAIResponse(text, characterName);
      if (parsed) {
        return { ...parsed, provider: cfg.name };
      }
    } catch (err) {
      console.warn(`[clues/${cfg.name}] error:`, err);
    }
  }
  return null;
}

async function generateWithAnthropic(prompt: string, characterName: string): Promise<AIGenerationResult | null> {
  const apiKey = getEnvKey("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 1024,
        temperature: 1.0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    const parsed = parseAIResponse(text, characterName);
    if (parsed) return { ...parsed, provider: "anthropic" };
  } catch (err) {
    console.warn("[clues/anthropic] error:", err);
  }
  return null;
}

async function generateWithOllama(prompt: string, characterName: string): Promise<AIGenerationResult | null> {
  const ollamaUrl = getEnvKey("OLLAMA_BASE_URL") || getEnvKey("OLLAMA_URL");
  if (!ollamaUrl) return null;
  const model = getEnvKey("OLLAMA_MODEL") || "llama3.2";
  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parseAIResponse(data?.response, characterName);
    if (parsed) return { ...parsed, provider: `ollama (${model})` };
  } catch (err) {
    console.warn("[clues/ollama] error:", err);
  }
  return null;
}

function hasAnyAIConfigured(): boolean {
  return Boolean(
    getGeminiKeys().length > 0 ||
    getEnvKey("GROQ_API_KEY") ||
    getEnvKey("OPENAI_API_KEY") ||
    getEnvKey("OPENROUTER_API_KEY") ||
    getEnvKey("ANTHROPIC_API_KEY") ||
    getEnvKey("OLLAMA_BASE_URL") ||
    getEnvKey("OLLAMA_URL")
  );
}

// ─── POST Handler (100% Live AI Agent — Zero Static Clues) ─────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawName = typeof body.characterName === "string" ? body.characterName.trim() : "";
    const clientExclude: string[] = Array.isArray(body.excludeQuestions) ? body.excludeQuestions : [];

    if (!rawName) {
      return NextResponse.json(
        { success: false, error: "Character name is required" },
        { status: 400 }
      );
    }

    if (!hasAnyAIConfigured()) {
      return NextResponse.json(
        {
          success: false,
          needsApiKey: true,
          error:
            "No AI API key configured. Add GEMINI_API_KEY (free from Google AI Studio), GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_BASE_URL to .env.local and restart the server.",
        },
        { status: 503 }
      );
    }

    const combinedExclude = Array.from(new Set([...recentGlobalClues, ...clientExclude]));
    const prompt = buildPrompt(rawName, combinedExclude);
    lastProviderError = "";

    const result =
      (await generateWithGemini(prompt, rawName)) ||
      (await generateWithOpenAICompatible(prompt, rawName)) ||
      (await generateWithAnthropic(prompt, rawName)) ||
      (await generateWithOllama(prompt, rawName));

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: lastProviderError
            ? `AI Agent error: ${lastProviderError}`
            : "AI Agent failed to generate clues right now. Please check your API key / quota and try again.",
        },
        { status: 502 }
      );
    }

    rememberClues(result.clues);
    return NextResponse.json({
      success: true,
      source: result.provider,
      character: rawName,
      aliases: result.aliases,
      clues: result.clues,
    });
  } catch (err) {
    console.error("[bollywood-guess/clues] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to generate AI clues" },
      { status: 500 }
    );
  }
}
