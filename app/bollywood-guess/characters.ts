// ═══════════════════════════════════════════════════════════════
//  BOLLYWOOD CHARACTER SUGGESTIONS & SPOILER SANITIZER
//  (No static clues stored — all clues are generated live by AI!)
// ═══════════════════════════════════════════════════════════════

export interface ClueItem {
  question: string;
  hint: string;
}

export interface BollywoodSuggestion {
  id: string;
  name: string;
  category: "superstars" | "ladies" | "comedy" | "villains";
  emoji: string;
  tagline: string;
}

// Quick-pick character names for UI convenience (zero clues stored!)
export const BOLLYWOOD_SUGGESTIONS: BollywoodSuggestion[] = [
  { id: "srk", name: "Shah Rukh Khan", category: "superstars", emoji: "👑", tagline: "The King of Romance" },
  { id: "salman", name: "Salman Khan", category: "superstars", emoji: "💪", tagline: "Bhaijaan of Bollywood" },
  { id: "amitabh", name: "Amitabh Bachchan", category: "superstars", emoji: "🎙️", tagline: "Shahenshah & Big B" },
  { id: "aamir", name: "Aamir Khan", category: "superstars", emoji: "🎯", tagline: "Mr. Perfectionist" },
  { id: "hrithik", name: "Hrithik Roshan", category: "superstars", emoji: "⚡", tagline: "The Greek God" },
  { id: "akshay", name: "Akshay Kumar", category: "superstars", emoji: "🥋", tagline: "The Khiladi" },
  { id: "ranveer", name: "Ranveer Singh", category: "superstars", emoji: "🔥", tagline: "The Energy Bomb" },
  { id: "ranbir", name: "Ranbir Kapoor", category: "superstars", emoji: "🎸", tagline: "Modern Heartthrob" },
  { id: "ajay", name: "Ajay Devgn", category: "superstars", emoji: "🦁", tagline: "Singham Star" },
  { id: "pankaj", name: "Pankaj Tripathi", category: "superstars", emoji: "🧣", tagline: "Kaleen Bhaiya" },
  { id: "vicky", name: "Vicky Kaushal", category: "superstars", emoji: "🪖", tagline: "How's the Josh?!" },
  { id: "kareena", name: "Kareena Kapoor", category: "ladies", emoji: "💅", tagline: "The Iconic Bebo" },
  { id: "deepika", name: "Deepika Padukone", category: "ladies", emoji: "✨", tagline: "Queen of Silver Screen" },
  { id: "alia", name: "Alia Bhatt", category: "ladies", emoji: "🌸", tagline: "Bollywood Powerhouse" },
  { id: "kajol", name: "Kajol", category: "ladies", emoji: "💃", tagline: "The Expressive Queen" },
  { id: "madhuri", name: "Madhuri Dixit", category: "ladies", emoji: "🪷", tagline: "Dhak-Dhak Girl" },
  { id: "priyanka", name: "Priyanka Chopra", category: "ladies", emoji: "🌍", tagline: "Desi Girl" },
  { id: "katrina", name: "Katrina Kaif", category: "ladies", emoji: "💃", tagline: "The Golden Dancer" },
  { id: "baburao", name: "Babu Bhaiya", category: "comedy", emoji: "👓", tagline: "Hera Pheri Legend" },
  { id: "munna_bhai", name: "Munna Bhai", category: "comedy", emoji: "🫂", tagline: "Jadoo Ki Jhappi" },
  { id: "circuit", name: "Circuit", category: "comedy", emoji: "⛓️", tagline: "Loyal Wingman" },
  { id: "chatur", name: "Chatur Ramalingam", category: "comedy", emoji: "📜", tagline: "Silencer (3 Idiots)" },
  { id: "gogo", name: "Crime Master Gogo", category: "comedy", emoji: "🧛", tagline: "Andaz Apna Apna" },
  { id: "govinda", name: "Govinda", category: "comedy", emoji: "🕺", tagline: "Hero No. 1" },
  { id: "gabbar", name: "Gabbar Singh", category: "villains", emoji: "🤠", tagline: "Sholay Icon" },
  { id: "mogambo", name: "Mogambo", category: "villains", emoji: "👑", tagline: "Mr. India Villain" },
  { id: "manjulika", name: "Manjulika", category: "villains", emoji: "👻", tagline: "Bhool Bhulaiyaa" },
  { id: "kancha", name: "Kancha Cheena", category: "villains", emoji: "💀", tagline: "Agneepath Villain" },
];

// ─── Strict Name Sanitizer (Safety net against accidental AI name leaks) ───
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeClueText(
  text: string,
  characterName: string,
  extraTokens: string[] = []
): string {
  if (!text || !characterName) return text;

  const stopWords = new Set([
    "the", "and", "for", "with", "from", "that", "this", "his", "her",
    "khan", "singh", "kapoor", "kumar", "sharma", "shroff", "deol", "bhatt",
    "bhai", "bhaiya", "master", "doctor", "inspector", "raja", "rani",
  ]);

  const rawWords = characterName
    .trim()
    .split(/[\s\-_.]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  const tokens = new Set<string>();
  if (characterName.trim().length >= 2) {
    tokens.add(characterName.trim());
  }
  for (const w of rawWords) {
    if (rawWords.length > 1 && stopWords.has(w.toLowerCase())) continue;
    tokens.add(w);
  }
  for (const extra of extraTokens) {
    if (extra.trim().length >= 3 && !stopWords.has(extra.trim().toLowerCase())) {
      tokens.add(extra.trim());
    }
  }

  let sanitized = text;
  const sortedTokens = Array.from(tokens).sort((a, b) => b.length - a.length);

  for (const token of sortedTokens) {
    const pattern = new RegExp(`\\b${escapeRegex(token)}(?:'s|s)?\\b`, "gi");
    sanitized = sanitized.replace(pattern, "this mystery star");
  }

  return sanitized
    .replace(/\bthis mystery star\s+this mystery star\b/gi, "this mystery star")
    .replace(/^this mystery star\b/, "This mystery star");
}
