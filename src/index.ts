import OpenAI from "openai";
import { GraphQLClient, gql } from "graphql-request";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// === TELEGRAM SETUP ===
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
const telegramChatId = process.env.TELEGRAM_CHAT_ID!;
async function sendTelegramMessage(text: string) {
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: telegramChatId,
      text,
      parse_mode: "Markdown",
    });
  } catch (err: any) {
    console.error("❌ Error sending Telegram message:", err.message || err);
  }
}

// === GRAPHQL CLIENTS ===
const mainEndpoint = `https://gateway.thegraph.com/api/${process.env.THEGRAPH_API_KEY}/subgraphs/id/${process.env.SUBGRAPH_MAIN_ID}`;
const courtEndpoint = `https://gateway.thegraph.com/api/${process.env.THEGRAPH_API_KEY}/subgraphs/id/${process.env.SUBGRAPH_COURT_ID}`;

const mainClient = new GraphQLClient(mainEndpoint, {
  headers: { "Content-Type": "application/json" },
});
const courtClient = new GraphQLClient(courtEndpoint, {
  headers: { "Content-Type": "application/json" },
});

// === TYPES ===
interface DisputeStateResponse {
  dispute: {
    id: string;
    court: { id: string; policy: string };
    period: string;
    lastPeriodChange: string;
    currentRound: { id: string; nbVotes: string };
    currentRoundIndex: string;
    templateId: string;
  };
}

interface TemplateResponse {
  disputeTemplate: { templateData: string };
}

interface Evidence {
  id: string;
  timestamp: string;
  description: string;
  fileURI: string;
}

interface EvidencesResponse {
  evidences: Evidence[];
}

// === GRAPHQL QUERIES ===
const QUERY_DISPUTE_STATE = gql`
  query DisputeState($id: ID!) {
    dispute(id: $id) {
      id
      court {
        id
        policy
      }
      period
      lastPeriodChange
      currentRound {
        id
        nbVotes
      }
      currentRoundIndex
      templateId
    }
  }
`;

const QUERY_TEMPLATE = gql`
  query DisputeTemplate($id: ID!) {
    disputeTemplate(id: $id) {
      templateData
    }
  }
`;

const QUERY_EVIDENCES = gql`
  query Evidences($evidenceGroupID: String!) {
    evidences(
      where: { evidenceGroup: $evidenceGroupID }
      orderBy: timestamp
      orderDirection: asc
    ) {
      id
      timestamp
      description
      fileURI
    }
  }
`;

// === UTILITIES ===
function prependIpfsPrefixDeep(obj: any): any {
  if (typeof obj === "string") {
    return obj.startsWith("/ipfs") ? `https://cdn.kleros.link${obj}` : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(prependIpfsPrefixDeep);
  }
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, prependIpfsPrefixDeep(value)])
    );
  }
  return obj;
}

function sanitizeLLMResponse(raw: string): any {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in response.");
    const jsonStr = match[0];
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("❌ Failed to parse LLM response:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function fetchFileContent(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)",
      },
    });

    const contentType = response.headers["content-type"] || "";
    const data = Buffer.from(response.data);

    if (contentType.includes("application/json")) {
      return JSON.stringify(JSON.parse(data.toString("utf8")), null, 2);
    } else if (contentType.startsWith("text/")) {
      return data.toString("utf8").trim();
    } else if (contentType.includes("application/pdf")) {
      return `[PDF Document] ${url}`;
    } else if (contentType.startsWith("image/")) {
      return `[Image File] ${url}`;
    } else {
      return `[Binary File] ${url}`;
    }
  } catch (error: any) {
    console.error(`Error fetching file from ${url}:`, error.message || error);
    return `[Error fetching file from ${url}]`;
  }
}

async function fetchAndEncodePDF(url: string): Promise<string> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  const base64 = Buffer.from(response.data).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}

// === LLM CLIENT ===
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// === MAIN EXECUTION ===
async function run(disputeID: string) {
  console.log("⏳ Fetching dispute state…");
  const { dispute } = await mainClient.request<DisputeStateResponse>(
    QUERY_DISPUTE_STATE,
    { id: disputeID }
  );

  console.log("⏳ Fetching dispute template…");
  const { disputeTemplate } = await courtClient.request<TemplateResponse>(
    QUERY_TEMPLATE,
    { id: dispute.templateId }
  );

  console.log("⏳ Fetching evidences…");
  const { evidences } = await mainClient.request<EvidencesResponse>(
    QUERY_EVIDENCES,
    { evidenceGroupID: disputeID }
  );

  // Prepend IPFS gateways
  const parsedTemplate = JSON.parse(disputeTemplate.templateData);
  const baseOutput = prependIpfsPrefixDeep({
    dispute_state: dispute,
    template: parsedTemplate,
    evidences,
  });

  console.log("⏳ Fetching evidence contents…");
  const evidenceContents = await Promise.all(
    baseOutput.evidences.map(async (ev: Evidence) => {
      if (ev.fileURI?.startsWith("http")) {
        const content = await fetchFileContent(ev.fileURI);
        return { ...ev, content };
      }
      return ev;
    })
  );

  console.log("✅ All essential data fetched.");

  const systemPrompt = `You are a fair and impartial arbitrator tasked with analyzing dispute evidence and making well-reasoned decisions. Consider all evidence carefully, weigh the credibility of sources, and provide clear justification for your conclusions. Only return a valid JSON object using the following schema, with no additional text or explanation. Do not wrap the object in a string or function call.
  Policy: ${baseOutput.dispute_state.court.policy}

  Schema:
  {
    "vote": {
      "id": string,
      "title": string,
      "description": string
    },
    "justification": string,
    "references": [
      {
        "evidence_id"?: string,
        "policy_reference"?: string,
        "description": string
      }
    ]
  }`;
  
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Please analyze this dispute case and select the most appropriate resolution from the available options.
      Dispute ID: ${dispute.id}
      Court: ${dispute.court.id}
      Policy: ${baseOutput.template.policyURI}
      Period: ${dispute.period}
      Available Answers:${JSON.stringify(parsedTemplate.answers, null, 2)}. 
      Please analyze this dispute and return only a JSON object using the exact schema below, no extra formatting.

      Schema:
      {
        "vote": {
          "id": string,
          "title": string,
          "description": string
        },
        "justification": string,
        "references": [
          {
            "evidence_id"?: string,
            "policy_reference"?: string,
            "description": string
          }
        ]
      }

      Your task:
      1) Review evidence
      2) Evaluate timeline
      3) Assess validity
      4) Return only the JSON object with your decision and justification.
      `,
    },
  ];

  for (const ev of evidenceContents) {
    if (ev.content.startsWith("[Image File]")) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Evidence (${ev.id}): ${ev.description}` },
          { type: "image_url", image_url: { url: ev.fileURI } },
        ],
      });
    } else if (ev.content.startsWith("[PDF Document]")) {
      try {
        const dataUrl = await fetchAndEncodePDF(ev.fileURI);
        messages.push({
          role: "user",
          content: [
            { type: "text", text: `Evidence (${ev.id}): ${ev.description}` },
            {
              type: "file",
              file: {
                filename: `evidence-${ev.id}.pdf`,
                file_data: dataUrl,
              },
            },
          ],
        });
      } catch (err) {
        console.error(`Failed to encode PDF ${ev.fileURI}:`, err);
      }
    } else if (ev.content.startsWith('[Binary File]') || ev.content.startsWith('[Error')) {
      messages.push({
        role: "user",
        content: `Evidence (${ev.id}): ${ev.description}${ev.content}`,
      });
    } else {
      messages.push({
        role: "user",
        content: `Evidence (${ev.id}): ${ev.description}${ev.content}`,
      });
    }
  };

  console.log("⏳ Sending to LLM for analysis...");
  const completion = await openai.chat.completions.create({
    model: "meta-llama/llama-4-maverick:free",
    messages,
    temperature: 0.5,
    response_format: { type: "json_object" },
  });

  const analysis = sanitizeLLMResponse(completion.choices[0].message.content || "{}");
  console.log("LLM Analysis:", JSON.stringify(analysis, null, 2));

  // Telegram: final analysis
  const vote = analysis.vote || {};
  await sendTelegramMessage(
    `🏁 *Dispute ${disputeID} Analysis Complete*
    • Dispute: https://v2.kleros.builders/#/cases/${dispute.id}/overview
    • Period: ${dispute.period}
    • Evidences: ${evidences.length}
    • Selected: ${vote.title ? `${vote.title} - ${vote.description}` : vote.id || "N/A"}
    • Justification: ${analysis.justification || "N/A"}`
  );
}

const [,, disputeID = "42"] = process.argv;
run(disputeID).catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
