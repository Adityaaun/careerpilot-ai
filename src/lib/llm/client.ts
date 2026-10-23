import { GoogleGenAI } from "@google/genai";

export interface LLMStatus {
  provider: "gemini" | "deterministic-fallback";
  model: string;
  isLive: boolean;
}

/**
 * Returns current LLM provider operational status
 */
export function getLLMStatus(): LLMStatus {
  const apiKey = process.env.GEMINI_API_KEY;
  const isLive = Boolean(apiKey && apiKey.trim().length > 5);
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  return {
    provider: isLive ? "gemini" : "deterministic-fallback",
    model: isLive ? model : "rule-engine-v1",
    isLive,
  };
}

/**
 * Calls Gemini API if configured, otherwise returns null for deterministic handling
 */
export async function callGemini(
  prompt: string,
  systemInstruction?: string,
  timeoutMs = 8000
): Promise<{ text: string; success: boolean; error?: string }> {
  const { isLive, model } = getLLMStatus();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!isLive || !apiKey) {
    return {
      text: "",
      success: false,
      error: "Live LLM is not configured; using deterministic engine.",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Use AbortController for strict timeout guarantees
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const contents = systemInstruction
      ? `${systemInstruction}\n\nUser: ${prompt}`
      : prompt;

    const response = await ai.models.generateContent({
      model,
      contents,
    });

    clearTimeout(timeoutId);

    const text = response.text || "";
    if (!text.trim()) {
      return { text: "", success: false, error: "Empty model output received." };
    }

    return { text, success: true };
  } catch (err) {
    const errorMsg = (err as Error).message || "Unknown error";
    const sanitizedMsg = errorMsg.includes("API key")
      ? "Invalid or rejected API key."
      : errorMsg.includes("quota") || errorMsg.includes("429")
      ? "Gemini API rate limit or quota exceeded."
      : errorMsg.includes("abort")
      ? "Gemini API request timed out."
      : "Gemini provider error.";

    console.warn(`[CareerPilot LLM] Fallback triggered: ${sanitizedMsg}`);
    return { text: "", success: false, error: sanitizedMsg };
  }
}
