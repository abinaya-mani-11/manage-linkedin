import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming } from "groq-sdk/resources/chat/completions";

// Initialize the Groq client. It will automatically use process.env.GROQ_API_KEY
const groq = new Groq();

type QualityCheck = {
  passed: boolean;
  issues: string[];
};

const HUMANIZER_STYLES = ["professional", "conversational", "concise"] as const;
type HumanizerStyle = (typeof HUMANIZER_STYLES)[number];

const STYLE_INSTRUCTIONS: Record<HumanizerStyle, string> = {
  professional:
    "Use a polished, confident, business-appropriate voice. Keep the author's point of view and avoid sounding stiff or corporate.",
  conversational:
    "Use a friendly, relatable, natural voice. Keep the author's point of view and avoid forced informality.",
  concise:
    "Make the post short and direct by removing unnecessary filler and repetition. Preserve every meaningful fact, technical detail, qualification, and claim; do not shorten by omitting substance.",
};

const MODEL = "openai/gpt-oss-20b";

class GroqOperationError extends Error {
  constructor(
    readonly operation: string,
    readonly status?: number,
    readonly code?: string
  ) {
    super(
      `Groq request failed during ${operation}${status ? ` (HTTP ${status}${code ? `, ${code}` : ""})` : ""}.`
    );
    this.name = "GroqOperationError";
  }
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function logGroqFailure(operation: string, error: unknown): GroqOperationError {
  const details = getRecord(error);
  const apiError = getRecord(details?.error);
  const status = typeof details?.status === "number" ? details.status : undefined;
  const code = typeof apiError?.code === "string" ? apiError.code : undefined;
  const errorType = typeof apiError?.type === "string" ? apiError.type : undefined;
  const headers = details?.headers;
  const getHeader =
    typeof headers === "object" &&
    headers !== null &&
    "get" in headers &&
    typeof headers.get === "function"
      ? headers.get.bind(headers)
      : undefined;
  const requestId =
    getHeader?.("x-request-id") ?? getHeader?.("x-groq-request-id") ?? undefined;

  console.error("[Groq] Request failed", {
    operation,
    model: MODEL,
    errorName: error instanceof Error ? error.name : "UnknownError",
    status,
    code,
    errorType,
    requestId,
  });
  return new GroqOperationError(operation, status, code);
}

async function createGroqCompletion(
  operation: string,
  request: ChatCompletionCreateParamsNonStreaming
) {
  try {
    return await groq.chat.completions.create(request);
  } catch (error: unknown) {
    throw logGroqFailure(operation, error);
  }
}

type QualityParse = {
  qualityCheck: QualityCheck | null;
  reason: string;
};

function parseQualityCheck(content: string): QualityParse {
  const trimmed = content.trim();
  if (!trimmed) return { qualityCheck: null, reason: "empty_content" };

  let response = trimmed.replace(/^```(?:text|json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const jsonResponse = response;
  if (jsonResponse.startsWith("{") && jsonResponse.endsWith("}")) {
    try {
      const parsed: unknown = JSON.parse(jsonResponse);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "passed" in parsed &&
        typeof parsed.passed === "boolean" &&
        "issues" in parsed &&
        Array.isArray(parsed.issues) &&
        parsed.issues.every((issue) => typeof issue === "string")
      ) {
        if (parsed.passed && parsed.issues.length === 0) {
          return { qualityCheck: { passed: true, issues: [] }, reason: "parsed_json" };
        }
        if (
          !parsed.passed &&
          parsed.issues.length > 0 &&
          parsed.issues.every((issue) => issue.trim().length > 0)
        ) {
          return {
            qualityCheck: { passed: false, issues: parsed.issues.slice(0, 5) },
            reason: "parsed_json",
          };
        }
      }
      return { qualityCheck: null, reason: "invalid_json_schema" };
    } catch {
      return { qualityCheck: null, reason: "invalid_json" };
    }
  }

  response = response.replace(/^\*\*(PASS|FAIL)\*\*/i, "$1");
  const lines = response.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const match = firstLine.match(/^(PASS|FAIL)\b(?:\s*[:—–-]\s*|\s+)?(.*)$/i);
  if (!match) return { qualityCheck: null, reason: "missing_status" };

  const status = match[1].toUpperCase();
  const explanation = [match[2], ...lines.slice(1)]
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim());

  if (status === "PASS") {
    const isExplicitPass =
      explanation.length === 0 ||
      explanation.every((line) => {
        const normalized = line.replace(/^[—–-]\s*/, "").trim();
        return /^(?:none\.?|no issues?(?: found| identified)?\.?|all checks? pass(?:ed)?\.?|checks? pass(?:ed)?\.?)$/i.test(
          normalized
        ) ||
          /^(?:no|none)\b.*\b(?:issues?|problems?|concerns?|discrepancies?|omissions?|errors?)\b.*$/i.test(
            normalized
          ) ||
          /^(?:all|every)\b.*\bpass(?:es|ed)?\.?$/i.test(normalized) ||
          /^(?:factual consistency|completeness|repetition|readability):\s*pass(?:ed)?\.?$/i.test(
            normalized
          );
      });
    return isExplicitPass
      ? { qualityCheck: { passed: true, issues: [] }, reason: "parsed_pass" }
      : { qualityCheck: null, reason: "ambiguous_pass_explanation" };
  }

  const issues = explanation.filter(
    (line) => !/^(?:issues?:\s*)?(?:none\.?|no issues?(?: found| identified)?\.?)$/i.test(line)
  );
  if (issues.length === 0) return { qualityCheck: null, reason: "fail_without_issues" };
  return {
    qualityCheck: { passed: false, issues: issues.slice(0, 5) },
    reason: "parsed_fail",
  };
}

class HumanizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanizationError";
  }
}

async function reviewHumanization(text: string, result: string): Promise<QualityCheck> {
  let lastDiagnostic = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const review = await createGroqCompletion("quality review", {
      messages: [
        {
          role: "system",
          content:
            attempt === 0
              ? `You are a strict editor validating a rewritten LinkedIn post against its source. Check factual consistency, completeness of meaningful facts and technical details, repetition, and natural readability. The source is the sole authority. Do not penalize a lack of emojis or hashtags.

Return exactly one of these formats, with no markdown or other commentary:
PASS

or:
FAIL: <one or more specific issues, separated by semicolons>

Use PASS only when all checks pass. Never put an explanation after PASS. If any check fails, use FAIL and identify what is missing or incorrect.`
              : `Validate this rewrite against its source for changed or invented facts, omitted details, repetition, and readability. Reply using exactly one format:
PASS
or
FAIL: <specific issue(s)>
Do not include a review, explanation, markdown, or any other text. Use PASS only if every check passes.`,
        },
        {
          role: "user",
          content: `SOURCE POST:\n${text}\n\nREWRITTEN POST:\n${result}`,
        },
      ],
      model: MODEL,
      temperature: 0,
      max_tokens: 512,
    });

    const choice = review.choices[0];
    const reviewText = choice?.message?.content?.trim() ?? "";
    const parsedReview = parseQualityCheck(reviewText);
    if (parsedReview.qualityCheck) return parsedReview.qualityCheck;

    const diagnostics = JSON.stringify({
      stage: "quality_review",
      attempt: attempt + 1,
      reason: parsedReview.reason,
      finishReason: choice?.finish_reason ?? "missing_choice",
      completionTokens: review.usage?.completion_tokens ?? null,
      responseCharacters: reviewText.length,
      responseShape: reviewText.startsWith("{")
        ? "json_like"
        : /^\s*```/.test(reviewText)
          ? "code_fence"
          : /^\s*\*\*(?:PASS|FAIL)\*\*/i.test(reviewText)
            ? "markdown_status"
            : /^\s*(?:PASS|FAIL)\b/i.test(reviewText)
              ? "status_prefix"
              : reviewText
                ? "other_text"
                : "empty",
    });
    lastDiagnostic = diagnostics;

    if (attempt === 0) {
      console.warn(`[Groq] Quality review response rejected; retrying ${diagnostics}`);
    }
  }

  console.error(
    `[Groq] Quality review remained malformed after retry ${JSON.stringify({
      stage: "quality_review",
      attempts: 2,
      model: MODEL,
      lastResponse: lastDiagnostic,
    })}`
  );
  throw new HumanizationError(
    "The quality review returned an incomplete response twice. Please try again."
  );
}

async function requestHumanization(text: string, style: HumanizerStyle) {
  const rewrite = await createGroqCompletion("humanization rewrite", {
    messages: [
      {
        role: "system",
        content: `Rewrite the supplied LinkedIn post in the selected style so it reads naturally and authentically while preserving the author's meaning and apparent writing style.

Requirements:
- Preserve every original fact, technical detail, qualification, and claim. Do not add or strengthen claims.
- Never invent personal experiences, achievements, statistics, opinions, or emotions.
- Remove repetitive wording, generic AI-sounding phrases, unnecessary filler, and awkward sentence structures.
- Use clear, readable paragraphs and a tone appropriate for LinkedIn.
- Do not add emojis or hashtags. Preserve meaningful ones already present when appropriate.
- Selected style: ${style}. ${STYLE_INSTRUCTIONS[style]}
- Return only the rewritten post, with no explanation.`,
      },
      { role: "user", content: text },
    ],
    model: MODEL,
    temperature: 0.35,
    max_tokens: 2048,
  });

  let result = rewrite.choices[0]?.message?.content?.trim() ?? "";
  if (!result) {
    console.error("[Groq] Humanization rewrite returned empty content", {
      operation: "humanization rewrite",
      model: MODEL,
    });
    throw new HumanizationError("Groq returned an empty rewrite. Please try again.");
  }

  let qualityCheck: QualityCheck = { passed: false, issues: [] };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    qualityCheck = await reviewHumanization(text, result);
    if (qualityCheck.passed || attempt === 1) {
      break;
    }

    const revision = await createGroqCompletion("humanization revision", {
      messages: [
        {
          role: "system",
          content: `Revise the rewritten LinkedIn post using the editor's quality-check issues. Treat the source as the sole authority: preserve all its facts, technical details, qualifications, and claims; do not invent or strengthen anything. Keep the author's meaning and apparent style, remove repetition, and use readable, natural paragraphs. Apply the selected ${style} style: ${STYLE_INSTRUCTIONS[style]} Do not add emojis or hashtags. Return only the revised post.`,
        },
        {
          role: "user",
          content: `SOURCE POST:\n${text}\n\nCURRENT REWRITE:\n${result}\n\nQUALITY ISSUES TO FIX:\n${qualityCheck.issues.join("\n")}`,
        },
      ],
      model: MODEL,
      temperature: 0.25,
      max_tokens: 2048,
    });

    const revisedResult = revision.choices[0]?.message?.content?.trim();
    if (!revisedResult) {
      console.error("[Groq] Humanization revision returned empty content", {
        operation: "humanization revision",
        model: MODEL,
      });
      throw new HumanizationError("Groq returned an empty revision. Please try again.");
    }
    result = revisedResult;
  }

  return { result, validation: qualityCheck };
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
    }

    const { action, text, style } = body as {
      action?: unknown;
      text?: unknown;
      style?: unknown;
    };

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    if (action !== "draft" && action !== "humanize") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "humanize") {
      if (
        style !== undefined &&
        (typeof style !== "string" ||
          !HUMANIZER_STYLES.includes(style as HumanizerStyle))
      ) {
        return NextResponse.json(
          {
            error: `Invalid humanizer style. Choose one of: ${HUMANIZER_STYLES.join(", ")}.`,
          },
          { status: 400 }
        );
      }
      const selectedStyle: HumanizerStyle =
        style === undefined ? "conversational" : (style as HumanizerStyle);

      try {
        return NextResponse.json(await requestHumanization(text, selectedStyle));
      } catch (error: unknown) {
        if (error instanceof GroqOperationError) {
          console.error("[Groq] Humanization workflow stopped", {
            operation: error.operation,
            status: error.status,
            code: error.code,
            model: MODEL,
          });
          return NextResponse.json({ error: error.message }, { status: 502 });
        }
        if (error instanceof HumanizationError) {
          return NextResponse.json({ error: error.message }, { status: 502 });
        }
        console.error("[Groq] Humanization workflow failed unexpectedly", {
          operation: "humanization workflow",
          errorName: error instanceof Error ? error.name : "UnknownError",
          model: MODEL,
        });
        return NextResponse.json(
          { error: "Unable to humanize and validate the post. Please try again." },
          { status: 502 }
        );
      }
    }

    let systemPrompt = "";

    if (action === "draft") {
      systemPrompt = `You are an expert LinkedIn copywriter and ghostwriter. Your goal is to take a rough idea or set of raw thoughts and expand them into a structured, engaging LinkedIn post draft.
      Keep the formatting clean with bullet points where necessary. Ensure there is a strong hook sentence. Do NOT use emojis yet.`;
    }

    const chatCompletion = await createGroqCompletion("draft generation", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text.trim() },
      ],
      model: MODEL,
      temperature: 0.5,
      max_tokens: 1024,
    });

    const result = chatCompletion.choices[0]?.message?.content?.trim() || "";
    if (!result) {
      return NextResponse.json({ error: "Groq returned an empty draft response" }, { status: 502 });
    }

    return NextResponse.json({ result });
  } catch (error: unknown) {
    const safeError = error instanceof GroqOperationError ? error : null;
    if (safeError) {
      console.error("[Groq] Draft generation failed", {
        operation: safeError.operation,
        status: safeError.status,
        code: safeError.code,
        model: MODEL,
      });
    } else {
      console.error("[Groq] Draft generation failed unexpectedly", {
        operation: "draft generation",
        errorName: error instanceof Error ? error.name : "UnknownError",
        model: MODEL,
      });
    }
    return NextResponse.json(
      { error: "Failed to process request", details: "Draft generation failed. Check server logs." },
      { status: 500 }
    );
  }
}
