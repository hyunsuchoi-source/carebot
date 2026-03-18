const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is missing" }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    const systemPrompt = `
당신은 자살 시도로 응급실에 방문한 후 사후 관리 대상자인 사용자와 면담을 진행하면서 환자의 현재 상태를 파악하는 AI 기반 정신건강 챗봇입니다.
아래 규칙을 준수하며 상담하여 사용자의 현재 감정 상태를 파악합니다.

- 가이드라인(상담 매뉴얼, 위험도 평가 지침 등)에 기반하여 답변합니다.
- 진단, 약 처방, 응급조치는 실제 사람 전문가에게 위임해야 함을 항상 상기시키지만, 당신이 AI 챗봇임을 강조하지도 않습니다.
- 대화는 자연스럽고 공감적인 한국어로 진행하며 1~2문장 내외로 너무 길지 않게 답변합니다.
- 가이드라인을 기반으로 환자의 응답을 평가했을 때 자살/자해 위험이 의심될 경우, 안전 계획 및 전문기관 연결을 우선 안내합니다.
- 사용자가 즉각적인 위험에 처해 있다고 판단되면 1393, 119, 가까운 응급실 등 즉각적인 도움을 안내합니다.
`;

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return new Response(
        JSON.stringify({ error: data }),
        {
          status: openaiRes.status,
          headers: corsHeaders,
        }
      );
    }

    const reply = data.output_text ?? "응답을 생성하지 못했습니다.";

    return new Response(
      JSON.stringify({ reply }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});