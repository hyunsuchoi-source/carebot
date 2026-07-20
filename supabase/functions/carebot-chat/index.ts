import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");

if (!supabaseUrl) throw new Error("SUPABASE_URL is missing");
if (!supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
if (!openaiApiKey) throw new Error("OPENAI_API_KEY is missing");
if (!resendApiKey) throw new Error("RESEND_API_KEY is missing");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const resend = new Resend(resendApiKey);

const ADMIN_ALERT_EMAIL = "hyunsu.choi@g.skku.edu";
const ALERT_FROM_EMAIL = "CAREBot <onboarding@resend.dev>";

const MAX_TURNS = 40;
const MAX_DURATION_MS = 5 * 60 * 1000;
const WARNING_1MIN_MS = 60 * 1000;
const WARNING_30SEC_MS = 30 * 1000;
const FORCE_EMAIL_ON_FINAL_TURN_FOR_TEST = false;

type RiskLevel = "low" | "medium" | "high" | "imminent";
type ConversationMode = "engagement" | "exploration" | "support" | "safety";

type GuidelineRow = {
  id?: number;
  risk_level: string;
  rule_id: string | null;
  rule_name: string | null;
  category: string | null;
  situation: string | null;
  trigger_keywords: string | null;
  ask_first: string | null;
  response_rule: string;
  safety_action: string | null;
  handoff_needed: string | null;
  source_id: string | null;
  source_section: string | null;
  source_page: string | null;
  priority: number | null;
};

type ConversationRuleRow = {
  risk_level: string;
  stage: number;
  intent_name: string | null;
  ask_first: string | null;
  response_rule: string | null;
};

type ConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type GuardrailCategory =
  | "self_harm_instruction"
  | "violence_instruction"
  | "illegal_instruction"
  | "sexual_content"
  | "prompt_injection"
  | "off_topic"
  | "none";

type AssessmentRow = {
  assessment_type: "PHQ-9" | "GAD-7" | "SBQ-R";
  score: number;
  risk_level?: string | null;
  assessed_at: string;
};

type LatestAssessmentScores = {
  phq9: number | null;
  gad7: number | null;
  sbqr: number | null;
};

type RiskDetailState = {
  isAlone: boolean;
  hasCurrentIntent: boolean;
  hasFrequentThoughts: boolean;
  hasPlan: boolean;
};

type QuickReply = {
  label: string;
  value: string;
};

type RecommendedAction = {
  label: string;
  action: string;
  route: string;
};

type LinkageIntent =
  | "ask_center_use"
  | "center_use_yes"
  | "center_use_no"
  | "ask_center_name"
  | "ask_existing_center_consent"
  | "ask_local_resource_consent"
  | "local_resource_consent_yes"
  | "local_resource_consent_no"
  | "ask_region"
  | "region_received"
  | "none";

type MiniAssessmentStage =
  | "none"
  | "offer"
  | "depression"
  | "anxiety"
  | "helplessness"
  | "need_help"
  | "self_harm"
  | "completed";

type MiniAssessmentScores = {
  depression?: number;
  anxiety?: number;
  helplessness?: number;
  needHelp?: number;
  selfHarm?: number;
};  

type RuleBasedReply = {
  handled: boolean;
  reply?: string;
  linkageIntent?: LinkageIntent;
  alertSocialWorker?: boolean;
  quickReplies?: QuickReply[];
  recommendedActions?: RecommendedAction[];
};

type LinkageInfo = {
  id?: string;
  user_id: string;
  center_name: string | null;
  region: string | null;
  center_use_status: "yes" | "no" | "unknown" | null;
  linkage_consent: boolean | null;
};

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectRiskLevel(message: string): RiskLevel {
  const text = normalizeText(message);
  const normalizedMessage = text.replace(/\s/g, "");

  const imminentKeywords = [
    "지금죽고",
    "당장죽고",
    "오늘죽",
    "지금끝내",
    "오늘끝내",
    "곧죽을",
    "지금실행",
    "유서",
    "방법찾",
    "어떻게죽",
    "준비했",
    "계획했",
    "도구준비",
    "약먹었",
    "이미먹었",
    "손목그었",
    "목맸",
    "뛰어내렸",
    "시도했",
    "목숨을끊",
    "자살할거",
    "죽으러갈",
    "번개탄",
    "칼로",
    "목을맬",
    "뛰어내릴",
    "한강가",
    "옥상올라",
    "가스틀",
    "유언",
    "작별인사",
    "마지막",
    "더이상못버틸",
    "할만큼했",
    "살고싶지",
    "살이유없",
    "끝내고싶",
    "지쳤",
    "답이없",
    "방법이없",
    "나아질것같지않",
    "계좌정리",
    "주식정리",
    "보험금"
  ];

  const highKeywords = [
    "죽고싶",
    "너무죽고싶",
    "진짜죽고싶",
    "계속죽고싶",
    "맨날죽고싶",
    "사라지고싶",
    "없어지고싶",
    "그만살고싶",
    "자살생각",
    "죽는생각",
    "계속생각나",
    "자해하고싶",
    "해치고싶",
    "죽는게낫",
    "사는게의미없",
    "눈뜨고싶지않",
    "도망가고싶",
    "포기하고싶",
    "모르겠"
  ];

  const mediumKeywords = [
    "너무힘들",
    "버티기힘들",
    "지치고",
    "지쳤",
    "희망이없",
    "미래가없",
    "막막",
    "우울",
    "불안",
    "불안해",
    "잠이안와",
    "불면",
    "식욕이없",
    "무기력",
    "아무것도하기싫",
    "의욕이없",
    "외롭",
    "혼자인것같",
    "아무도없",
  ];

  const negativeContext = [
    "죽고싶지않",
    "자살안할",
    "생각은있지만안할",
    "실행할생각은없",
    "해치진않을",
  ];

  const hasNegativeContext = negativeContext.some((k) =>
    normalizedMessage.includes(k.replace(/\s/g, ""))
  );


if (
  imminentKeywords.some(keyword =>
    normalizedMessage.includes(keyword.replace(/\s/g, ""))
  )
) {
  return "imminent";
}

if (
  highKeywords.some(keyword =>
    normalizedMessage.includes(keyword.replace(/\s/g, ""))
  )
) {
  return "high";
}

if (hasNegativeContext) {
  return "low";
}

if (
  mediumKeywords.some(keyword =>
    normalizedMessage.includes(keyword.replace(/\s/g, ""))
  )
) {
  return "medium";
}

return "low";
}

function detectRiskDetailState(text: string): RiskDetailState {
  const normalized = normalizeText(text);
  const normalizedText = normalized.replace(/\s/g, "");

  const alonePatterns = [
    "혼자있어",
    "지금혼자",
    "방안에혼자",
    "집에혼자",
    "아무도없어",
    "주변에아무도없어",
    "혼자있",
    "나혼자",
  ];

  const currentIntentPatterns = [
    "지금죽고싶",
    "당장죽고싶",
    "오늘죽고싶",
    "지금끝내고싶",
    "오늘끝내고싶",
    "바로죽고싶",
    "지금하고싶",
  ];

  const frequentPatterns = [
    "계속생각나",
    "자꾸생각나",
    "매일생각나",
    "맨날생각나",
    "계속죽고싶",
    "반복돼",
    "계속엄청",
  ];

  const planPatterns = [
    "방법찾",
    "계획했",
    "준비했",
    "도구준비",
    "유서",
    "약먹을",
    "뛰어내릴",
    "목맬",
    "번개탄",
    "칼로",
    "한강가",
    "옥상올라",
  ];

  return {
    isAlone: alonePatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
  ),
    hasCurrentIntent: currentIntentPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
  ),
    hasFrequentThoughts: frequentPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
  ),
    hasPlan: planPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
  ),
};
}

async function classifyRiskWithLLM(message: string): Promise<RiskLevel> {
  console.log("LLM classify start:", message);

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `
사용자의 자살 위험도를 low, medium, high, imminent 중 하나로 분류하세요.

기준:
- low: 일반적인 스트레스
- medium: 우울, 불안, 절망감 표현
- high: 죽고 싶다, 죽어야 하나 싶다, 죽어야 되나 생각한다, 죽는 게 나을 것 같다, 사라지고 싶다, 없어지고 싶다, 잠들면 안 깨고 싶다 등 자살 사고 표현
- imminent: 지금/오늘 실행, 계획, 준비, 도구 확보, 자살 시도, 유서 작성 언급

추가 규칙:
- 사용자가 죽음 자체를 고려하거나 죽는 것이 해결책처럼 표현하면 high로 분류합니다.
- 표현이 애매하면 더 높은 위험도로 해석합니다.
- low로 과소평가하는 것보다 high로 분류하는 것을 우선합니다.

반드시 JSON만 출력:
{"risk":"low"}
            `.trim(),
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    const data = await res.json();

    console.log("LLM raw response:", JSON.stringify(data));
    console.log("LLM output_text:", data.output_text);

    if (!res.ok) {
      console.error("LLM risk API error:", JSON.stringify(data));
      return "low";
    }

    const rawOutput =
      data.output_text ??
      data.output?.[0]?.content?.[0]?.text ??
      "";

    const outputText = String(rawOutput)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(outputText);

    if (["low", "medium", "high", "imminent"].includes(parsed.risk)) {
      return parsed.risk as RiskLevel;
    }

    return "low";
  } catch (e) {
    console.error("classifyRiskWithLLM error:", e);
    return "low";
  }
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "imminent"];

  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

function buildRuleBasedLinkageReply(
  finalRisk: RiskLevel,
  turnCount: number,
  conversationHistory: ConversationMessage[],
  linkageInfo: LinkageInfo | null,
): RuleBasedReply {
  if (hasAskedCenterUse(conversationHistory)) {
    return { handled: false };
  }

  if (linkageInfo?.center_use_status || linkageInfo?.center_name) {
  return { handled: false };
  }

  if (finalRisk === "low" || finalRisk === "medium") {
    if (turnCount < 10) return { handled: false };

    return {
      handled: true,
      linkageIntent: "ask_center_use",
      reply:
        "상담을 진행하기 전에 필요한 경우 적절한 도움과 연결해 드리기 위해 한 가지 확인할게요. 혹시 현재 정신건강복지센터나 상담기관을 이용 중이신가요?",
      quickReplies: [
        { label: "이용 중이에요", value: "center_use_yes" },
        { label: "이용하지 않아요", value: "center_use_no" },
        { label: "잘 모르겠어요", value: "center_use_unknown" },
      ],
    };
  }

  return { handled: false };
}

function getLastAssistantMessage(conversationHistory: ConversationMessage[]): string {
  return (
    [...conversationHistory]
      .reverse()
      .find((m) => m.role === "assistant" && typeof m.content === "string")?.content ?? ""
  );
}

function inferPendingLinkageStep(conversationHistory: ConversationMessage[]): LinkageIntent {
  const lastAssistant = normalizeText(getLastAssistantMessage(conversationHistory));

  if (
    lastAssistant.includes("이용 중인 기관") &&
    (lastAssistant.includes("기관명") || lastAssistant.includes("알려주"))
  ) {
    return "ask_center_name";
  }

  if (
    lastAssistant.includes("기관 담당자") &&
    (lastAssistant.includes("동의") || lastAssistant.includes("전달"))
  ) {
    return "ask_existing_center_consent";
  }

  if (
    lastAssistant.includes("거주 지역") &&
    (lastAssistant.includes("알려주") || lastAssistant.includes("어디"))
  ) {
    return "ask_region";
  }

  return "none";
}

function isSystemButtonValue(message: string): boolean {
  return [
    "center_use_yes",
    "center_use_no",
    "center_use_unknown",
    "center_share_consent_yes",
    "center_share_consent_no",
    "local_resource_consent_yes",
    "local_resource_consent_no",
  ].includes(message);
}

function hasAskedCenterUse(conversationHistory: ConversationMessage[]): boolean {
  return conversationHistory.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      m.content.includes("정신건강복지센터") &&
      m.content.includes("이용 중")
  );
}

function escalateRiskForEnvironment(risk: RiskLevel, detailState: RiskDetailState): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "imminent"];
  let idx = order.indexOf(risk);

  if (detailState.isAlone && (risk === "medium" || risk === "high")) {
    idx = Math.min(idx + 1, order.length - 1);
  }

  if (detailState.hasCurrentIntent && detailState.hasPlan) {
    idx = Math.max(idx, order.indexOf("imminent"));
  }

  return order[idx];
}

function getTurnCount(conversationHistory: ConversationMessage[] = []): number {
  const validMessages = conversationHistory.filter(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim() !== ""
  );

  return validMessages.length + 1;
}

function classifyGuardrailCategory(message: string): GuardrailCategory {
  const text = normalizeText(message);
  const normalizedText = text.replace(/\s/g, "");

  const promptInjectionPatterns = [
    "시스템 프롬프트",
    "system prompt",
    "프롬프트 보여",
    "규칙 보여",
    "규칙 알려",
    "내부 규칙",
    "보안 설정",
    "이전 지시 무시",
    "ignore previous",
    "developer message",
    "hidden prompt",
    "숨겨진 프롬프트",
    "역할 바꿔",
  ];

  const selfHarmInstructionPatterns = [
    "자살 방법",
    "죽는 방법",
    "안 들키게 죽",
    "편하게 죽",
    "목매는 법",
    "뛰어내리면",
    "몇 알 먹으면 죽",
    "치명적인 약",
    "유서 쓰는 법",
    "자해 방법",
    "손목 그으면",
    "죽는 데",
    "번개탄",
  ];

  const violenceInstructionPatterns = [
    "사람 죽이는 법",
    "해치는 법",
    "칼로 찌",
    "보복하는 법",
    "폭행하는 법",
    "협박하는 법",
    "살인",
  ];

  const illegalInstructionPatterns = [
    "해킹",
    "마약 만드는",
    "폭탄 만드는",
    "불법 약물",
    "몰래카메라",
    "도박 사이트",
  ];

  const sexualContentPatterns = [
    "야한 얘기",
    "성적인 얘기",
    "19금",
    "자위",
    "벗어",
    "음란",
  ];

  const offTopicPatterns = [
    "주식 추천",
    "코인 추천",
    "정치 얘기",
    "욕해봐",
    "아무 말이나 해봐",
    "아무말 대잔치",
    "재밌는 얘기",
    "농담해봐",
  ];

  if (
    promptInjectionPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
    )
  )
    return "prompt_injection";

  if (
    selfHarmInstructionPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
    )
  )
    return "self_harm_instruction";

  if (
    violenceInstructionPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
    )
  )
    return "violence_instruction";

  if (
    illegalInstructionPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
    )
  )
    return "illegal_instruction";

  if (
    sexualContentPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
    )
  )
    return "sexual_content";

  if (
    offTopicPatterns.some((p) =>
      normalizedText.includes(p.replace(/\s/g, ""))
    )
  )
    return "off_topic";

  return "none";
}

function buildGuardrailReply(category: GuardrailCategory): string {
  switch (category) {
    case "self_harm_instruction":
      return "그런 방법이나 구체적인 실행 정보는 안내할 수 없어요. 다만 지금 마음이 많이 힘들다면 그 부분은 함께 이야기해볼 수 있어요. 당장 위험한 상황이면 119, 109, 가까운 응급실에 바로 도움을 요청해 주세요.";
    case "violence_instruction":
      return "다른 사람이나 자신을 해치는 방법에 대해서는 도와드릴 수 없어요. 원하시면 지금 어떤 기분이 올라오고 있는지 차분하게 이야기해볼 수 있어요.";
    case "illegal_instruction":
      return "위험하거나 불법적인 방법은 안내할 수 없어요. 대신 지금 답답하거나 복잡한 마음이 있다면 그건 함께 정리해볼 수 있어요.";
    case "sexual_content":
      return "그런 내용의 대화는 어렵습니다. 원하시면 지금 기분이나 오늘 있었던 일을 편하게 이야기해 주세요.";
    case "prompt_injection":
      return "내부 설정이나 규칙 자체는 안내할 수 없어요. 대신 여기서는 편하게 대화를 이어갈 수 있어요. 지금 이야기하고 싶은 주제가 있나요?";
    case "off_topic":
      return "그런 요청에는 답하기 어려워요. 그래도 가볍게 대화하는 건 괜찮아요. 오늘 어땠는지 편하게 이야기해 주셔도 돼요.";
    default:
      return "그 요청은 도와드리기 어려워요. 대신 편하게 이야기 나누는 건 괜찮아요. 지금 떠오르는 이야기부터 해주셔도 돼요.";
  }
}

function parseTriggerKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,/;\n|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function riskWeight(ruleRisk: string, detectedRisk: string): number {
  const order: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    imminent: 4,
  };

  const rule = order[ruleRisk] ?? 0;
  const detected = order[detectedRisk] ?? 0;

  if (rule === detected) return 20;
  if (rule === detected - 1) return 10;
  if (rule === detected + 1) return 5;
  return 5;
}

function keywordMatchScore(message: string, row: GuidelineRow): number {
  const text = normalizeText(message);
  const normalizedText = text.replace(/\s/g, "");
  const keywords = parseTriggerKeywords(row.trigger_keywords);

  let score = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword).replace(/\s/g, "");

    if (normalizedKeyword && normalizedText.includes(normalizedKeyword)) {
      score += 50;
    }
  }

  if (row.situation) {
    const situation = normalizeText(row.situation).replace(/\s/g, "");
    if (normalizedText.includes(situation)) score += 20;
  }

  if (row.category) {
    const category = normalizeText(row.category).replace(/\s/g, "");
    if (normalizedText.includes(category)) score += 10;
  }

  return score;
}

function handoffToBoolean(value: string | null): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return ["yes", "true", "y", "1", "필요", "예"].includes(v);
}

function selectRelevantGuidelines(
  rows: GuidelineRow[],
  message: string,
  detectedRisk: string
): GuidelineRow[] {
  const ranked = rows
    .map((row) => {
      const score =
        riskWeight(row.risk_level, detectedRisk) +
        keywordMatchScore(message, row) +
        (row.ask_first ? 3 : 0) +
        (row.safety_action ? 3 : 0) -
        ((row.priority ?? 999) * 0.5);

      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 5).map((item) => item.row);
}

function buildGuidelineText(rows: GuidelineRow[]): string {
  if (!rows.length) {
    return `
- 관련 가이드라인을 찾지 못한 경우에도 공감적이고 간결하게 응답합니다.
- 자살/자해 위험이 의심되면 안전 확인을 우선합니다.
- 즉각적 위험이 의심되면 109, 119, 가까운 응급실 도움을 즉시 안내합니다.
- 표현이 완전히 일치하지 않더라도 가장 유사한 위험수준 원칙을 참고합니다.
- 애매하면 더 안전한 방향으로 해석합니다.
`.trim();
  }

  return rows
    .map((row, index) => {
      return `
[가이드라인 ${index + 1}]
- 위험도: ${row.risk_level}
- 규칙 ID: ${row.rule_id ?? ""}
- 규칙명: ${row.rule_name ?? ""}
- 범주: ${row.category ?? ""}
- 상황: ${row.situation ?? ""}
- 먼저 확인할 질문: ${row.ask_first ?? ""}
- 응답 원칙: ${row.response_rule}
- 안전 조치: ${row.safety_action ?? ""}
- 전문기관 연계 필요: ${handoffToBoolean(row.handoff_needed) ? "예" : "아니오"}
- 출처: ${row.source_id ?? ""} / ${row.source_section ?? ""} / p.${row.source_page ?? ""}
`.trim();
    })
    .join("\n\n");
}

function buildConversationRuleText(rows: ConversationRuleRow[]): string {
  if (!rows.length) {
    return `
- 대화는 일상 대화처럼 자연스럽게 이어갑니다.
- 한 번에 하나의 핵심만 다룹니다.
- 질문을 연속으로 쏟아내지 않습니다.
- 사용자가 짧게 답하거나 모르겠다고 하면 질문 강도를 낮춥니다.
- 자살 위험이 의심될 때만 직접적으로 확인합니다.
- 고위험에서는 일반 문진형 질문을 중단하고 안전 확보를 우선합니다.
`.trim();
  }

  return rows
    .map((row, index) => {
      return `
[대화규칙 ${index + 1}]
- 위험도: ${row.risk_level}
- 단계(stage): ${row.stage}
- 의도명: ${row.intent_name ?? ""}
- 먼저 할 질문: ${row.ask_first ?? ""}
- 응답 원칙: ${row.response_rule ?? ""}
`.trim();
    })
    .join("\n\n");
}

function buildConversationTextForFinalRisk(
  conversationHistory: ConversationMessage[] = [],
  currentMessage: string
) {
  const userTexts = conversationHistory
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .map((m) => m.content.trim())
    .filter(Boolean);

  userTexts.push(currentMessage.trim());
  return userTexts.join(" ");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseSessionStartTime(sessionStartTime?: string): number {
  if (!sessionStartTime) return Date.now();
  const parsed = new Date(sessionStartTime).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function buildInitialConsentAndGreeting(): string {
  return [
    "안녕하세요. 삼성서울병원 생명사랑위기대응센터 챗봇 CAREBot입니다.",
    "",
    "본 챗봇은 정보 제공과 심리적 지원을 위한 도구이며, 의료적 진단이나 처방을 대신하지 않습니다.",
    "상담 내용은 자동 저장되어 담당 사회복지사에게 전달될 수 있습니다.",
    "상담은 약 5분 내외로 진행되며, 사용자는 언제든 중단할 수 있습니다.",
    "",
    "위 내용에 동의하시는 경우 대화를 이어가 주세요.",
    "오늘 하루는 어떠셨나요?",
  ].join("\n");
}

function getTimeWarningMessage(remainingMs: number): string | null {
  if (remainingMs <= 0) return null;
  if (remainingMs <= WARNING_30SEC_MS) {
    return "곧 정해진 상담 시간이 마무리될 예정이에요. 남은 시간에는 지금 가장 중요한 한 가지만 함께 볼게요.";
  }
  if (remainingMs <= WARNING_1MIN_MS) {
    return "이제 상담 시간이 1분 정도 남았어요. 새로운 이야기를 넓히기보다 지금 가장 중요한 마음이나 상태에 집중해볼게요.";
  }
  return null;
}

function buildTimeLimitClosingReply(finalDetectedRisk: RiskLevel): string {
  if (finalDetectedRisk === "high" || finalDetectedRisk === "imminent") {
    return "정해진 상담 시간이 끝났지만 지금은 혼자 버티지 않는 것이 더 중요해 보여요. 가능하면 바로 주변 사람이나 보호자에게 알리고, 109나 119, 가까운 응급실에 도움을 요청해 주세요. 지금 대화 내용은 담당자에게 전달될 수 있어요.";
  }

  return "정해진 상담 시간이 마무리되어 오늘 대화는 여기까지 진행할게요. 필요하면 다시 이용하실 수 있고, 지금도 안전이 걱정되면 109, 119 또는 가까운 응급실에 도움을 요청해 주세요.";
}

function detectAssessmentRisk(scores: LatestAssessmentScores): "low" | "medium" | "high" {
  const { phq9, gad7, sbqr } = scores;

  if (
    (phq9 !== null && phq9 >= 15) ||
    (gad7 !== null && gad7 >= 15) ||
    (sbqr !== null && sbqr >= 7)
  ) {
    return "high";
  }

  if (
    (phq9 !== null && phq9 >= 10) ||
    (gad7 !== null && gad7 >= 10) ||
    (sbqr !== null && sbqr >= 5)
  ) {
    return "medium";
  }

  return "low";
}

function buildImmediateSafetyReply(): string {
  return "지금은 대화를 길게 이어가기보다 안전을 먼저 확보하는 것이 중요해요. 가능하면 바로 가까운 보호자나 주변 사람에게 알리고, 119나 109에 즉시 연락해 주세요. 혼자 계시다면 문을 열 수 있는 가까운 사람에게 바로 연락해 주세요.";
}

function isDontKnowLike(message: string): boolean {
  const text = normalizeText(message);
  return [
    "몰라",
    "모르겠",
    "모르겠다",
    "아무것도 하고 싶지 않아",
    "말하기 싫",
    "잘 모르겠",
    "모르겟"
  ].some((k) => text.includes(k));
}

type DontKnowContext =
  | "state_unknown"
  | "information_unknown"
  | "general_unknown";

async function classifyDontKnowContext(
  message: string,
  conversationHistory: ConversationMessage[]
): Promise<DontKnowContext> {
  const recentHistory = conversationHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `
사용자의 "모르겠다", "몰라", "잘 모르겠다"는 표현의 의미를 분류하세요.

분류 기준:
- state_unknown:
  자신의 감정, 마음, 현재 상태를 표현하거나 이해하기 어려운 경우
  예: "내 마음이 어떤지 모르겠어요", "무슨 감정인지 모르겠어요"

- information_unknown:
  방법, 절차, 위치, 연락처, 사용법 등 외부 정보나 행동 방법을 모르는 경우
  예: "호흡을 어떻게 하는지 모르겠어요", "어디에 연락해야 할지 모르겠어요"

- general_unknown:
  위 두 범주로 명확하게 분류하기 어려운 단순하거나 맥락이 부족한 응답
  예: "그냥 모르겠어요"

반드시 아래 JSON 형식으로만 응답하세요.
{"context":"state_unknown"}
            `.trim(),
          },
          {
            role: "user",
            content: `
최근 대화:
${recentHistory}

현재 사용자 발화:
${message}
            `.trim(),
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("dontKnow context API error:", await res.text());
      return "general_unknown";
    }

    const data = await res.json();

    const rawOutput =
      data.output_text ??
      data.output?.[0]?.content?.[0]?.text ??
      "";

    const outputText = String(rawOutput)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(outputText);

    if (
      ["state_unknown", "information_unknown", "general_unknown"].includes(
        parsed.context
      )
    ) {
      return parsed.context as DontKnowContext;
    }

    return "general_unknown";
  } catch (error) {
    console.error("classifyDontKnowContext error:", error);
    return "general_unknown";
  }
}

async function shouldOfferMiniAssessment(
  message: string,
  conversationHistory: ConversationMessage[]
): Promise<boolean> {

  // "모르겠다" 계열이 아니면 바로 종료
  if (!isDontKnowLike(message)) {
    return false;
  }

  // LLM에게 의미 판별 요청
  const context = await classifyDontKnowContext(
    message,
    conversationHistory
  );

  // 방법·정보를 모르는 경우
  if (context === "information_unknown") {
    return false;
  }

  // 자신의 상태를 표현하지 못하는 경우
  if (context === "state_unknown") {
    return true;
  }

  // 애매한 경우는 기존처럼 반복 여부 확인
  const recentUserMessages =
    getRecentUserMessages(conversationHistory);

  const unclearCount = [...recentUserMessages, message]
    .filter((text) => isDontKnowLike(text))
    .length;

  return unclearCount >= 2;
}

function parseZeroToTenScore(message: string): number | null {
  const match = message.match(/\b(10|[0-9])\b/);
  if (!match) return null;

  const score = Number(match[1]);
  if (Number.isNaN(score) || score < 0 || score > 10) return null;

  return score;
}

function detectMiniAssessmentRisk(scores: MiniAssessmentScores): RiskLevel {
  const depression = scores.depression ?? 0;
  const anxiety = scores.anxiety ?? 0;
  const helplessness = scores.helplessness ?? 0;
  const needHelp = scores.needHelp ?? 0;
  const selfHarm = scores.selfHarm ?? 0;

  const total = depression + anxiety + helplessness + needHelp + selfHarm;

  if (selfHarm >= 7) return "imminent";
  if (selfHarm >= 4 || total >= 35) return "high";
  if (total >= 20) return "medium";
  return "low";
}

function maxRiskLevel(...risks: RiskLevel[]): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "imminent"];

  return risks.reduce((max, risk) => {
    return order.indexOf(risk) > order.indexOf(max) ? risk : max;
  }, "low");
}

function buildMiniAssessmentQuestion(stage: MiniAssessmentStage): {
  reply: string;
  quickReplies: QuickReply[];
} {
  const scoreReplies = Array.from({ length: 11 }, (_, i) => ({
    label: String(i),
    value: `mini_score_${i}`,
  }));

  if (stage === "depression") {
    return {
      reply:
        "현재 우울한 정도를 0에서 10점 중 하나로 표현한다면 몇 점 정도인가요?\n\n0은 전혀 우울하지 않음, 10은 매우 심하게 우울함을 의미해요.",
      quickReplies: scoreReplies,
    };
  }

  if (stage === "anxiety") {
    return {
      reply:
        "현재 불안한 정도는 0에서 10점 중 몇 점 정도인가요?\n\n0은 전혀 불안하지 않음, 10은 매우 심하게 불안함을 의미해요.",
      quickReplies: scoreReplies,
    };
  }

  if (stage === "helplessness") {
    return {
      reply:
        "현재 무기력하거나 아무것도 하기 어렵다고 느끼는 정도는 0에서 10점 중 몇 점 정도인가요?",
      quickReplies: scoreReplies,
    };
  }

  if (stage === "need_help") {
    return {
      reply:
        "지금 누군가의 도움이 필요하다고 느끼는 정도는 0에서 10점 중 몇 점 정도인가요?",
      quickReplies: scoreReplies,
    };
  }

  return {
    reply:
      "현재 스스로를 해치고 싶은 마음은 0에서 10점 중 몇 점 정도인가요?\n\n0은 전혀 없음, 10은 매우 강함을 의미해요.",
    quickReplies: scoreReplies,
  };
}

function isShortReply(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length <= 3 || ["응", "네", "아니", "몰라", "음", "으"].includes(trimmed);
}

function shouldRecommendHealingContent(message: string): boolean {
  const text = message
    .replace(/\s+/g, "")
    .toLowerCase();

  const patterns = [
    "뭘해야",
    "뭐해야",
    "어떻게해야",
    "방법을모르",
    "방법모르",
    "모르겠",
    "막막",
    "아무것도못하",
    "불안해서아무것도",
    "진정이안",
    "마음이복잡",
  ];

  return patterns.some((p) => text.includes(p));
}

function shouldRecommendCrisisGuide(message: string): boolean {
  const text = message
    .replace(/\s+/g, "")
    .toLowerCase();

  const patterns = [
    "도움받",
    "연락처",
    "전화번호",
    "어디연락",
    "상담받",
    "기관알려",
    "센터알려",
    "24시간",
    "응급",
    "도와줄곳",
  ];

  return patterns.some((p) => text.includes(p));
}


function getRecentAssistantMessages(conversationHistory: ConversationMessage[]): string[] {
  return conversationHistory
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .slice(-4)
    .map((m) => m.content);
}

function getRecentUserMessages(conversationHistory: ConversationMessage[]): string[] {
  return conversationHistory
    .filter((m) => m.role === "user" && typeof m.content === "string")
    .slice(-4)
    .map((m) => m.content);
}

function hasRecentTimeWarning(conversationHistory: ConversationMessage[]): boolean {
  return getRecentAssistantMessages(conversationHistory).some(
    (text) =>
      text.includes("상담 시간이 1분 정도 남았어요") ||
      text.includes("곧 정해진 상담 시간이 마무리될 예정이에요")
  );
}

function inferConversationMode(
  finalRisk: RiskLevel,
  message: string,
  conversationHistory: ConversationMessage[]
): ConversationMode {
  const userTexts = getRecentUserMessages(conversationHistory).join(" ");
  const text = normalizeText(`${userTexts} ${message}`);

  if (finalRisk === "high" || finalRisk === "imminent") return "safety";
  if (isDontKnowLike(message) || isShortReply(message)) return "support";
  if (["우울", "불안", "짜증", "힘들", "외롭", "무기력"].some((k) => text.includes(k))) {
    return "exploration";
  }
  return "engagement";
}

function getSoftFollowUpHint(
  mode: ConversationMode,
  message: string,
  finalRisk: RiskLevel,
  riskDetailState: RiskDetailState,
  conversationHistory: ConversationMessage[]
): string {
  const recentAssistantJoined = getRecentAssistantMessages(conversationHistory).join(" ");
  const text = normalizeText(message);

  if (finalRisk === "high" || finalRisk === "imminent") {
    if (!riskDetailState.isAlone && !recentAssistantJoined.includes("누구와 함께")) {
      return "혼자 있는지 또는 곁에 사람 있는지만 짧게 확인";
    }
    if (riskDetailState.isAlone && !recentAssistantJoined.includes("지금 문을 열 수") && !recentAssistantJoined.includes("연락")) {
      return "주변 사람이나 보호자에게 바로 연결 가능한지 한 가지만 확인";
    }
    return "안전 확보를 돕는 한 가지 행동만 제안";
  }

  if (mode === "support") {
    return "사용자가 답을 정리하기 어렵다는 점을 먼저 받아주고, 질문 대신 지금 상태를 한 단어로만 말해도 괜찮다고 안내";
  }

  if (mode === "exploration") {
    if (text.includes("짜증")) return "짜증 뒤에 있는 감정이나 오늘 있었던 일 한 장면을 자연스럽게 물어보기";
    if (text.includes("우울")) return "우울하다고 느끼는 순간이 언제 심해지는지 부드럽게 물어보기";
    if (text.includes("불안")) return "불안이 올라오는 순간이나 몸에서 느껴지는 변화를 부드럽게 물어보기";
    return "현재 감정이나 오늘 가장 힘들었던 순간을 일상 대화처럼 부드럽게 묻기";
  }

  return "문진처럼 나열하지 말고, 오늘 하루나 지금 기분에서 시작해 자연스럽게 이어가기";
}

function getRepeatedQuestionGuardText(conversationHistory: ConversationMessage[]): string {
  const recentAssistant = getRecentAssistantMessages(conversationHistory).join(" ");
  return `
[반복 질문 방지]
- 최근 assistant 메시지와 의미가 비슷한 질문은 다시 하지 않습니다.
- 특히 "일상생활하는 데 크게 힘든 점은 없으세요?", "오늘 하루는 어떠셨어요?", "가장 힘든 부분이 있나요?"와 유사한 질문을 반복하지 않습니다.
- 사용자가 "몰라", "모르겠다", "아무것도 하고 싶지 않다"처럼 답하면 같은 뜻의 질문을 다시 바꿔서 묻지 않습니다.
- 최근 assistant 메시지 참고:
${recentAssistant || "- 없음"}
`.trim();
}

async function getLinkageInfo(userId: string): Promise<LinkageInfo | null> {
  const { data, error } = await supabase
    .from("patient_linkage_info")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("failed to load linkage info:", error);
    return null;
  }

  return data as LinkageInfo | null;
}

async function getLatestAssessmentScores(userId: string): Promise<LatestAssessmentScores> {
  const { data, error } = await supabase
    .from("assessments")
    .select("assessment_type, score, assessed_at")
    .eq("user_id", userId)
    .in("assessment_type", ["PHQ-9", "GAD-7", "SBQ-R"])
    .order("assessed_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load assessments: ${error.message}`);
  }

  let phq9: number | null = null;
  let gad7: number | null = null;
  let sbqr: number | null = null;

  for (const row of (data ?? []) as AssessmentRow[]) {
    if (row.assessment_type === "PHQ-9" && phq9 === null) phq9 = row.score;
    if (row.assessment_type === "GAD-7" && gad7 === null) gad7 = row.score;
    if (row.assessment_type === "SBQ-R" && sbqr === null) sbqr = row.score;
    if (phq9 !== null && gad7 !== null && sbqr !== null) break;
  }

  return { phq9, gad7, sbqr };
}

async function getUserNameById(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("❌ failed to load user name:", error);
    return userId;
  }

  return data?.name || userId;
}

async function sendAdminAlertViaResend(params: {
  adminEmail: string;
  message: string;
  finalRisk: string;
  currentRisk: string;
  assessmentRisk: string;
  scores: LatestAssessmentScores;
  matchedGuidelines: Array<{
    rule_id: string | null;
    rule_name: string | null;
    risk_level: string;
    source_id: string | null;
  }>;
  conversationHistory: ConversationMessage[];
  userId: string;
  userName: string;
}) {
  const conversationPreview = [...params.conversationHistory, { role: "user", content: params.message }]
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map(
      (m) => `<li><strong>${m.role === "user" ? "사용자" : "챗봇"}:</strong> ${escapeHtml(m.content)}</li>`
    )
    .join("");

  const guidelineHtml = params.matchedGuidelines.length
    ? `<ul>${params.matchedGuidelines
        .map(
          (g) =>
            `<li>${escapeHtml(g.risk_level)} / ${escapeHtml(g.rule_id ?? "-")} / ${escapeHtml(
              g.rule_name ?? "-"
            )} / ${escapeHtml(g.source_id ?? "-")}</li>`
        )
        .join("")}</ul>`
    : "<p>매칭된 가이드라인 없음</p>";

  const { error } = await resend.emails.send({
    from: ALERT_FROM_EMAIL,
    to: params.adminEmail,
    subject: `⚠️ CAREBot 위험 감지 알림 (${params.finalRisk.toUpperCase()})`,
    html: `
      <h2>위험 환자 감지 알림</h2>
      <p><strong>사용자 이름:</strong> ${escapeHtml(params.userName)}</p>
      <p><strong>대화 전체 기준 최종 위험도:</strong> ${escapeHtml(params.finalRisk)}</p>
      <p><strong>검사 기반 위험도:</strong> ${escapeHtml(params.assessmentRisk)}</p>
      <p><strong>최신 PHQ-9:</strong> ${params.scores.phq9 ?? "-"}</p>
      <p><strong>최신 GAD-7:</strong> ${params.scores.gad7 ?? "-"}</p>
      <p><strong>최신 SBQ-R:</strong> ${params.scores.sbqr ?? "-"}</p>
      <hr />
      <h3>최근 대화</h3>
      <ul>${conversationPreview}</ul>
      <hr />
      <p><strong>발송 시각:</strong> ${new Date().toISOString()}</p>
    `,
  });

  if (error) {
    throw new Error(`Resend alert failed: ${JSON.stringify(error)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      message,
      centerName,
      regionName,
      conversationHistory = [],
      isFinalTurn = false,
      user_id,
      session_start_time,
      miniAssessmentStage = "none",
      miniAssessmentScores = {},
      miniAssessmentCompleted = false ,
    }: {
      message?: string;
      centerName?: string;
      regionName?: string;
      conversationHistory?: ConversationMessage[];
      isFinalTurn?: boolean;
      user_id?: string;
      session_start_time?: string;
      miniAssessmentStage?: MiniAssessmentStage;
      miniAssessmentScores?: MiniAssessmentScores;
    } = await req.json();
   

    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!message || typeof message !== "string" || message.trim() === "") {
      const initial = buildInitialConsentAndGreeting();
      return new Response(
        JSON.stringify({
          reply: initial,
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount: 0,
          quickReplies: [],

          recommendedActions: [
            ...(shouldRecommendHealingContent(message)
              ? [
                  {
                    label: "마음치유 콘텐츠 보기",
                    action: "open_healing_content",
                    route: "/healing-content",
                  },
                ]
              : []),

            ...(shouldRecommendCrisisGuide(message)
             ? [
                  {
                    label: "위기대응 가이드 보기",
                    action: "open_crisis_guide",
                    route: "/crisis-guide",
                  },
                ]
              : []),
            ],

          ruleBasedHandled: false,
          linkageIntent: "none",
          ruleBasedHandled: false,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const turnCount = getTurnCount(conversationHistory);

    if (
      miniAssessmentStage === "none" &&
      !miniAssessmentCompleted &&
      await shouldOfferMiniAssessment(
          message,
          conversationHistory
     )
    ) {
        return new Response(
          JSON.stringify({
            reply:
              "말로 정리하기 어려울 수 있어요. 지금 상태를 조금 더 이해하기 위해 몇 가지 간단한 질문을 드려도 괜찮을까요?",
            quickReplies: [
              { label: "네", value: "mini_assessment_start" },
              { label: "아니요", value: "mini_assessment_decline" },
            ],
            miniAssessmentStage: "offer",
            miniAssessmentScores,
            ruleBasedHandled: true,
            conversationEnded: false,
            turnCount,
            linkageIntent: "none",
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (message === "mini_assessment_start") {
        const q = buildMiniAssessmentQuestion("depression");

        return new Response(
          JSON.stringify({
            reply: q.reply,
            quickReplies: q.quickReplies,
            miniAssessmentStage: "depression",
            miniAssessmentScores: {},
            ruleBasedHandled: true,
            conversationEnded: false,
            turnCount,
            linkageIntent: "none",
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (message === "mini_assessment_decline") {
        return new Response(
          JSON.stringify({
            reply:
              "괜찮아요. 질문에 답하지 않아도 됩니다. 지금은 편하게 떠오르는 말부터 이야기해주셔도 돼요.",
            quickReplies: [],
            miniAssessmentStage: "none",
            miniAssessmentScores: {},
            ruleBasedHandled: true,
            conversationEnded: false,
            turnCount,
            linkageIntent: "none",
          }),
          { status: 200, headers: corsHeaders }
        );
      }


       if (
        miniAssessmentStage !== "none" &&
        miniAssessmentStage !== "offer" &&
        miniAssessmentStage !== "completed"
      ) {
        const score =
          message.startsWith("mini_score_")
            ? Number(message.replace("mini_score_", ""))
            : parseZeroToTenScore(message);

        if (score === null || Number.isNaN(score) || score < 0 || score > 10) {
          return new Response(
            JSON.stringify({
              reply: "0부터 10 사이의 숫자로 선택해 주세요.",
              quickReplies: Array.from({ length: 11 }, (_, i) => ({
                label: String(i),
                value: `mini_score_${i}`,
              })),
              miniAssessmentStage,
              miniAssessmentScores,
              ruleBasedHandled: true,
              conversationEnded: false,
              turnCount,
              linkageIntent: "none",
            }),
            { status: 200, headers: corsHeaders }
            );
          }

        const updatedScores: MiniAssessmentScores = { ...miniAssessmentScores };

        if (miniAssessmentStage === "depression") updatedScores.depression = score;
        if (miniAssessmentStage === "anxiety") updatedScores.anxiety = score;
        if (miniAssessmentStage === "helplessness") updatedScores.helplessness = score;
        if (miniAssessmentStage === "need_help") updatedScores.needHelp = score;
        if (miniAssessmentStage === "self_harm") updatedScores.selfHarm = score;

        if (miniAssessmentStage === "self_harm") {
          const miniRisk = detectMiniAssessmentRisk(updatedScores);

          return new Response(
            JSON.stringify({
              reply:
                miniRisk === "low"
                  ? "답변해주셔서 고마워요. 현재 상태를 참고해서 조금 더 편하게 이야기 이어가볼게요."
                  : "답변해주셔서 고마워요. 지금 상태를 보면 도움이 더 필요할 수 있어 보여요. 혼자 감당하지 않도록 함께 확인해볼게요.",
              quickReplies: [],
              miniAssessmentStage: "completed",
              miniAssessmentCompleted: true,
              miniAssessmentScores: updatedScores,
              miniAssessmentRisk: miniRisk,
              ruleBasedHandled: true,
              conversationEnded: false,
              turnCount,
              linkageIntent: "none",
            }),
            { status: 200, headers: corsHeaders }
          );
        }

     const nextStageMap: Record<MiniAssessmentStage, MiniAssessmentStage> = {
       none: "none",
      offer: "offer",
      depression: "anxiety",
      anxiety: "helplessness",
      helplessness: "need_help",
      need_help: "self_harm",
      self_harm: "completed",
      completed: "completed",
     };

    const nextStage = nextStageMap[miniAssessmentStage];
    const q = buildMiniAssessmentQuestion(nextStage);

    return new Response(
      JSON.stringify({
        reply: q.reply,
        quickReplies: q.quickReplies,
        miniAssessmentStage: nextStage,
        miniAssessmentScores: updatedScores,
        ruleBasedHandled: true,
        conversationEnded: false,
        turnCount,
        linkageIntent: "none",
      }),
      { status: 200, headers: corsHeaders }
    );
  }

    const linkageInfo = await getLinkageInfo(user_id);

    console.log("🔍 linkageInfo:", linkageInfo);
    console.log("🔍 user_id:", user_id);

    const pendingLinkageStep = inferPendingLinkageStep(conversationHistory);

    if (
      pendingLinkageStep === "ask_center_name" &&
      !isSystemButtonValue(message)
    ) {
      const submittedCenterName = centerName?.trim() || message.trim();

      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        center_use_status: "yes",
        center_name: submittedCenterName,
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            `${submittedCenterName} 이용 중으로 확인했습니다. 이 정보는 담당 사회복지사가 이미 연결된 기관을 파악하는 데 활용됩니다. 위기 상황에서 바로 참고할 수 있도록 위기대응가이드도 함께 확인해 주세요. 해당 기관 담당자에게 현재 상태를 알릴 수 있도록 담당 사회복지사에게 전달해도 괜찮을까요?`,
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount,
          linkageIntent: "ask_existing_center_consent",
          ruleBasedHandled: true,
          recommendedActions: [
            {
              label: "위기대응 가이드 보러가기",
              action: "open_crisis_guide",
              route: "/crisis-guide",
            },
          ],
          quickReplies: [
            {
              label: "동의해요",
              value: "center_share_consent_yes",
            },
            {
              label: "동의하지 않아요",
              value: "center_share_consent_no",
            },
          ],
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (
      pendingLinkageStep === "ask_region" &&
      !isSystemButtonValue(message)
    ) {
      const submittedRegionName = regionName?.trim() || message.trim()
        .replace(/^거주\s*지역\s*:\s*/i, "")
        .trim();

      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        region : submittedRegionName,
        linkage_consent: true,
        updated_at: new Date().toISOString(),
      });

      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        linkage_consent: false,
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            `${submittedRegionName} 기준으로 도움받을 수 있는 지역사회 자원을 확인해볼게요. 담당 사회복지사가 관련 정보를 안내해 드릴 예정입니다. 지금은 상담을 계속 이어가도 괜찮아요. 지금 가장 힘들게 느껴지는 부분은 무엇인가요?`,
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: true,
          conversationEnded: false,
          turnCount,
          quickReplies: [],
          linkageIntent: "region_received",
          ruleBasedHandled: true,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (message === "center_use_yes") {
      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        center_use_status: "yes",
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            "현재 이용 중인 기관명을 알려주실 수 있을까요? 담당 사회복지사가 이미 연결된 기관을 파악하는 데 도움이 됩니다. 위기 상황에서 바로 참고할 수 있도록 위기대응가이드도 함께 확인해 주세요.",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount,
          quickReplies: [],
          recommendedActions: [
            {
              label: "위기대응 가이드 보러가기",
              action: "open_crisis_guide",
              route: "/crisis-guide",
            },
          ],
          linkageIntent: "ask_center_name",
          ruleBasedHandled: true,
          inputMode: "center_name",
          inputLabel: "이용 중인 기관명",
          inputPlaceholder: "예: 미추홀구정신건강복지센터",
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (message === "center_use_no" || message === "center_use_unknown") {
      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        center_use_status: message === "center_use_no" ? "no" : "unknown",
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            "그렇다면 도움받을 수 있는 지역사회 자원을 연결해드릴 수 있어요. 연계에 동의하시나요?",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount,
          linkageIntent: "ask_local_resource_consent",
          ruleBasedHandled: true,
          quickReplies: [
            {
              label: "동의해요",
              value: "local_resource_consent_yes",
            },
            {
              label: "동의하지 않아요",
              value: "local_resource_consent_no",
            },
          ],
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (message === "center_share_consent_yes") {
      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        center_share_consent: "true",
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            "알겠습니다. 담당 사회복지사에게 현재 상태와 이용 중인 기관 정보를 전달할게요. 지금은 상담을 계속 이어가도 괜찮아요. 지금 가장 힘든 부분은 무엇인가요?",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: true,
          conversationEnded: false,
          turnCount,
          quickReplies: [],
          linkageIntent: "none",
          ruleBasedHandled: true,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (message === "center_share_consent_no") {
      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        center_share_consent: "false",
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            "알겠습니다. 기관 정보는 담당 사회복지사에게 전달하지 않을게요. 지금은 상담을 계속 이어가도 괜찮아요. 지금 가장 힘든 부분은 무엇인가요?",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount,
          quickReplies: [],
          linkageIntent: "none",
          ruleBasedHandled: true,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (message === "local_resource_consent_yes") {
      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        local_resource_consent: "true",
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            "알겠습니다. 거주 지역을 기준으로 도움받을 수 있는 기관을 확인해볼게요. 현재 거주 지역을 알려주실 수 있을까요? 예: 서울 강남구, 수원시 영통구",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount,
          quickReplies: [],
          linkageIntent: "ask_region",
          ruleBasedHandled: true,
          inputMode: "region",
          inputLabel: "거주 지역",
          inputPlaceholder: "예: 인천 미추홀구",
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (message === "local_resource_consent_no") {
      await supabase.from("patient_linkage_info").upsert({
        user_id: user_id,
        local_resource_consent: "false",
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          reply:
            "알겠습니다. 연계는 진행하지 않을게요. 필요할 때는 언제든 도움을 요청하실 수 있어요. 급하게 도움이 필요해질 때는 위기대응가이드를 확인하거나 109, 119, 가까운 응급실에 도움을 요청해 주세요.",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: false,
          turnCount,
          quickReplies: [],
          recommendedActions: [
            {
              label: "위기대응 가이드 보러가기",
              action: "open_crisis_guide",
              route: "/crisis-guide",
            },
          ],
          linkageIntent: "none",
          ruleBasedHandled: true,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (turnCount > MAX_TURNS) {
      return new Response(
        JSON.stringify({
          reply: "정해진 상담 횟수에 도달해 오늘 대화는 여기까지 진행할게요. 지금 많이 힘들거나 안전이 걱정되면 109, 119 또는 가까운 응급실에 바로 도움을 요청해 주세요.",
          currentDetectedRisk: "low",
          assessmentDetectedRisk: "low",
          finalDetectedRisk: "low",
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: true,
          turnCount,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const ruleDetectedRisk = detectRiskLevel(message);
    console.log("ruleDetectedRisk:", ruleDetectedRisk);

    const llmDetectedRisk = await classifyRiskWithLLM(message);
    console.log("llmDetectedRisk:", llmDetectedRisk);

    const currentDetectedRisk = maxRisk(ruleDetectedRisk, llmDetectedRisk);
    console.log("currentDetectedRisk:", currentDetectedRisk);

    const guardrailCategory = classifyGuardrailCategory(message);

    if (guardrailCategory !== "none") {
      return new Response(
        JSON.stringify({
          reply: buildGuardrailReply(guardrailCategory),
          currentDetectedRisk,
          assessmentDetectedRisk: "low",
          finalDetectedRisk: currentDetectedRisk,
          latestScores: { phq9: null, gad7: null, sbqr: null },
          matchedGuidelines: [],
          alertTriggered: false,
          redirectedByGuardrail: true,
          guardrailCategory,
          turnCount,
          sessionStartTime: session_start_time ?? new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const latestScores = await getLatestAssessmentScores(user_id);
    const assessmentDetectedRisk = detectAssessmentRisk(latestScores);

    const finalRiskInput = isFinalTurn
      ? buildConversationTextForFinalRisk(conversationHistory, message)
      : message;

    const ruleFinalRisk = detectRiskLevel(finalRiskInput);
    const llmFinalRisk = await classifyRiskWithLLM(finalRiskInput);
    const textFinalRisk = maxRisk(ruleFinalRisk, llmFinalRisk);

    const riskDetailState = detectRiskDetailState(finalRiskInput);
    const miniAssessmentRisk =
      miniAssessmentStage === "completed"
        ? detectMiniAssessmentRisk(miniAssessmentScores)
        : "low";

    const finalDetectedRisk = maxRiskLevel(
      escalateRiskForEnvironment(textFinalRisk, riskDetailState),
      miniAssessmentRisk
    );

    const sessionStartTime = session_start_time ?? new Date().toISOString();
    const sessionStartMs = parseSessionStartTime(sessionStartTime);
    const nowMs = Date.now();
    const elapsedMs = nowMs - sessionStartMs;
    const remainingMs = MAX_DURATION_MS - elapsedMs;

    const bypassTimeLimit = finalDetectedRisk === "high" || finalDetectedRisk === "imminent";

    if (!bypassTimeLimit && elapsedMs >= MAX_DURATION_MS) {
      return new Response(
        JSON.stringify({
          reply: buildTimeLimitClosingReply(finalDetectedRisk),
          currentDetectedRisk,
          assessmentDetectedRisk,
          finalDetectedRisk,
          latestScores,
          matchedGuidelines: [],
          alertTriggered: false,
          conversationEnded: true,
          timeLimitReached: true,
          turnCount,
          riskDetailState,
          sessionStartTime,
          elapsedMs,
          remainingMs: 0,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const shouldSendEmail = FORCE_EMAIL_ON_FINAL_TURN_FOR_TEST
      ? isFinalTurn
      : isFinalTurn && (finalDetectedRisk === "high" || finalDetectedRisk === "imminent");

    const { data: guidelineRows, error: guidelineError } = await supabase
      .from("guidelines")
      .select(`
        risk_level,
        rule_id,
        rule_name,
        category,
        situation,
        trigger_keywords,
        ask_first,
        response_rule,
        safety_action,
        handoff_needed,
        source_id,
        source_section,
        source_page,
        priority
      `);

    if (guidelineError) {
      return new Response(
        JSON.stringify({ error: `Failed to load guidelines: ${guidelineError.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    const selectedGuidelines = selectRelevantGuidelines(
      (guidelineRows ?? []) as GuidelineRow[],
      finalRiskInput,
      finalDetectedRisk
    );

    const matchedGuidelines = selectedGuidelines.map((g) => ({
      rule_id: g.rule_id,
      rule_name: g.rule_name,
      risk_level: g.risk_level,
      source_id: g.source_id,
    }));

    if (shouldSendEmail) {
      try {
        const userName = await getUserNameById(user_id);
        await sendAdminAlertViaResend({
          adminEmail: ADMIN_ALERT_EMAIL,
          message,
          finalRisk: finalDetectedRisk,
          currentRisk: currentDetectedRisk,
          assessmentRisk: assessmentDetectedRisk,
          scores: latestScores,
          matchedGuidelines,
          conversationHistory,
          userId: user_id,
          userName,
        });
      } catch (emailError) {
        console.error("❌ admin alert failed:", emailError);
      }
    }

    const { data: conversationRuleRows, error: conversationRuleError } = await supabase
      .from("conversation_rules")
      .select(`
        risk_level,
        stage,
        intent_name,
        ask_first,
        response_rule
      `)
      .eq("risk_level", finalDetectedRisk)
      .order("stage", { ascending: true });

    if (conversationRuleError) {
      return new Response(
        JSON.stringify({ error: `Failed to load conversation rules: ${conversationRuleError.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    const guidelineText = buildGuidelineText(selectedGuidelines);
    const conversationRuleText = buildConversationRuleText(
      (conversationRuleRows ?? []) as ConversationRuleRow[]
    );

    const timeWarningMessage =
      !bypassTimeLimit && !hasRecentTimeWarning(conversationHistory)
        ? getTimeWarningMessage(remainingMs)
        : null;

    const ruleBasedReply = buildRuleBasedLinkageReply(
      finalDetectedRisk,
      turnCount,
      conversationHistory,
      linkageInfo
    );

    if (ruleBasedReply.handled && ruleBasedReply.reply) {
      return new Response(
        JSON.stringify({
          reply: ruleBasedReply.reply,
          currentDetectedRisk,
          assessmentDetectedRisk,
          finalDetectedRisk,
          latestScores,
          matchedGuidelines,
          alertTriggered: shouldSendEmail,
          conversationEnded: false,
          turnCount,
          riskDetailState,
          linkageIntent: ruleBasedReply.linkageIntent,
          quickReplies: ruleBasedReply.quickReplies ?? [],
          recommendedActions: ruleBasedReply.recommendedActions ?? [],
          ruleBasedHandled: true,
          sessionStartTime,
          elapsedMs,
          remainingMs: Math.max(0, remainingMs),
          timeWarningMessage,
          timeLimitReached: false,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const conversationMode = inferConversationMode(finalDetectedRisk, message, conversationHistory);
    const softFollowUpHint = getSoftFollowUpHint(
      conversationMode,
      message,
      finalDetectedRisk,
      riskDetailState,
      conversationHistory
    );

    const shouldMentionLinkage =
      linkageInfo &&
      turnCount >= 4 &&
      finalDetectedRisk !== "high" &&
      finalDetectedRisk !== "imminent";
    
      const linkageInfoText = linkageInfo
  ? `
[저장된 연계 정보]
- 정신건강복지센터/상담기관 이용 여부: ${linkageInfo.center_use_status ?? "없음"}
- 이용 중인 기관명: ${linkageInfo.center_name ?? "없음"}
- 거주 지역: ${linkageInfo.region ?? "없음"}
- 기존 기관 전달 동의: ${linkageInfo.center_share_consent ?? "없음"}
- 지역사회 자원 연계 동의: ${linkageInfo.local_resource_consent ?? "없음"}

[연계 정보 사용 규칙]
- 위 정보는 내부 참고용입니다.
- 상담 시작 직후에는 저장된 기관 정보를 먼저 말하지 않습니다.
- 사용자가 기관, 센터, 연계, 담당자 전달, 도움 연결에 대해 먼저 말한 경우에만 저장된 기관 정보를 확인합니다.
- 일상 대화 중에는 정신건강복지센터나 상담기관 이용 여부를 먼저 묻지 않습니다.
- 이미 저장된 기관 이용 여부나 기관명이 있으면 같은 질문을 반복하지 않습니다.
`
  : `
[저장된 연계 정보]
- 저장된 정신건강복지센터/상담기관 정보가 없습니다.
`;

    const systemPrompt = `
당신은 삼성서울병원 생명사랑위기대응센터의 AI 기반 상담 챗봇 CAREBot입니다.
역할은 치료나 진단이 아니라, 사용자의 감정과 현재 상태를 자연스럽게 살피고 필요시 안전한 도움으로 연결하는 것입니다.

[가장 중요한 목표]
- 문진표처럼 캐묻지 말고, 일상 대화처럼 자연스럽게 반응합니다.
- 사용자가 자신의 감정, 기분, 오늘 있었던 일, 현재 상태를 편하게 꺼낼 수 있도록 돕습니다.
- 공감 → 짧은 반영 → 필요한 경우 한 가지 질문의 흐름을 유지합니다.
- 한 번에 질문 하나만 합니다.
- 사용자가 짧게 답하거나 "몰라", "모르겠다"고 하면 더 캐묻지 말고 질문 강도를 낮춥니다.
- 같은 의미의 질문을 반복하지 않습니다.
- 고위험에서는 일반적인 감정/생활 질문으로 되돌아가지 말고 안전 확보를 우선합니다.

[말투]
- 한국어로 답합니다.
- 상담자처럼 따뜻하지만 과한 치료적 해석은 하지 않습니다.
- 일반적으로 1~3문장 이내로 답합니다.
- 첫 문장은 감정 반영이나 수용으로 시작하는 것이 좋습니다.
- 평가하거나 훈계하지 않습니다.
- 대답을 강요하지 않습니다.
- 질문이 꼭 필요하지 않으면 질문 없이 짧게 반응해도 됩니다.

[대화 스타일]
- "오늘 하루는 어떠셨어요?" 같은 도입 질문은 대화 초반에만 사용합니다.
- 이후에는 사용자가 한 말에 붙어서 묻습니다.
- 예: "짜증나" → "많이 답답하셨겠어요. 오늘 특히 거슬렸던 일이 있었나요?"
- 예: "몰라" → "지금은 말로 정리하기 어려울 수 있어요. 한 단어만 말해도 괜찮아요."
- 예: "아무것도 하고 싶지 않아" → "기운이 많이 빠진 상태처럼 들려요. 지금은 쉬고 싶은 마음이 큰가요?"
- 문진처럼 수면, 식사, 기능을 기계적으로 나열하지 않습니다.
- 사용자가 스스로 꺼낸 내용에서 다음 대화를 이어갑니다.

[위험 대응]
- 자살 위험이 의심되면 직접적이되 짧고 분명하게 확인합니다.
- high 또는 imminent 위험에서는 일반적인 탐색 질문을 중단합니다.
- high/imminent에서는 안전 확보, 주변 사람 연결, 109/119/응급실 안내를 우선합니다.
- immediate safety mode에서는 설명을 길게 하지 않습니다.
- 사용자가 "연락하고 싶지 않다"고 해도 비난하지 말고 가능한 다음 한 가지 행동을 제안합니다.

[반복 질문 방지]
${getRepeatedQuestionGuardText(conversationHistory)}

${linkageInfoText}

[현재 대화 해석]
- 현재 메시지 위험도: ${currentDetectedRisk}
- 검사 기반 위험도: ${assessmentDetectedRisk}
- 최종 판단 위험도: ${finalDetectedRisk}
- 대화 모드: ${conversationMode}
- 최신 PHQ-9: ${latestScores.phq9 ?? "-"}
- 최신 GAD-7: ${latestScores.gad7 ?? "-"}
- 최신 SBQ-R: ${latestScores.sbqr ?? "-"}

[위험 상세 상태]
- 혼자 있음: ${riskDetailState.isAlone ? "예" : "아니오"}
- 현재성 있음: ${riskDetailState.hasCurrentIntent ? "예" : "아니오"}
- 반복성/빈도 높음: ${riskDetailState.hasFrequentThoughts ? "예" : "아니오"}
- 계획 단서 있음: ${riskDetailState.hasPlan ? "예" : "아니오"}

[시간 제한]
- 세션 경과 시간(ms): ${elapsedMs}
- 세션 남은 시간(ms): ${Math.max(0, remainingMs)}
- 시간 제한 예외 여부: ${bypassTimeLimit ? "예" : "아니오"}
- 시간 임박 안내 필요 여부: ${timeWarningMessage ? "예" : "아니오"}
- 상담은 약 5분 내외입니다.
- 남은 시간이 적으면 새로운 주제를 넓히지 말고 지금 가장 중요한 부분만 다룹니다.
- 종료가 가까우면 자연스럽게 정리하고, 종료 이유가 드러나게 답합니다.

[이번 턴 힌트]
- 이번 턴에서는: ${softFollowUpHint}

[가이드라인]
${guidelineText}

[대화 규칙 참고]
${conversationRuleText}

[출력 규칙]
- 최근 assistant 메시지와 비슷한 질문을 반복하지 않습니다.
- 사용자가 이미 거부한 질문은 다른 표현으로 다시 묻지 않습니다.
- 꼭 필요한 경우에만 질문을 넣습니다.
- 질문을 넣더라도 하나만 넣습니다.
- 답변 끝에 자동으로 정형 질문을 덧붙이지 않습니다.
- "일상생활하는 데 크게 힘든 점은 없으세요?"와 같은 문진형 표현은 사용하지 않습니다.
`.trim();

    const openaiInput: ConversationMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
      { role: "user", content: message },
    ];

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: openaiInput,
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: openaiRes.status,
        headers: corsHeaders,
      });
    }

    let reply =
      data.output_text ??
      data.output?.[0]?.content?.[0]?.text ??
      "응답을 생성하지 못했습니다.";

    if (
      timeWarningMessage &&
      !reply.includes("상담 시간이 1분 정도 남았어요") &&
      !reply.includes("곧 정해진 상담 시간이 마무리될 예정이에요")
    ) {
      reply = `${reply}\n\n${timeWarningMessage}`;
    }

    return new Response(
      JSON.stringify({
        reply,
        currentDetectedRisk,
        assessmentDetectedRisk,
        finalDetectedRisk,
        latestScores,
        matchedGuidelines,
        alertTriggered: shouldSendEmail,
        conversationEnded: false,
        turnCount,
        riskDetailState,
        conversationMode,
        linkageIntent: "none",
        quickReplies: [],

        recommendedActions: shouldRecommendHealingContent(message)
          ? [
               {
                  label: "마음치유 콘텐츠 보기",
                  action: "open_healing_content",
                  route: "/healing-content",
                },
            ]
          : [],
        ruleBasedHandled: false,
        sessionStartTime,
        elapsedMs,
        remainingMs: Math.max(0, remainingMs),
        timeWarningMessage,
        timeLimitReached: false,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("❌ function error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});