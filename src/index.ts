import OpenAI from 'openai';
import { GraphQLClient, gql } from "graphql-request";
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// === CLIENTS ===
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

// === QUERIES ===
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

// === UTILITY ===
function prependIpfsPrefixDeep(obj: any): any {
  if (typeof obj === "string") {
    return obj.startsWith("/ipfs") ? `https://cdn.kleros.link${obj}` : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(prependIpfsPrefixDeep);
  }
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        prependIpfsPrefixDeep(value),
      ])
    );
  }
  return obj;
}

async function fetchFileContent(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)'
      },
      maxContentLength: 5 * 1024 * 1024, // 5MB
    });

    const contentType = response.headers['content-type'] || '';
    const data = Buffer.from(response.data);

    if (contentType.includes('application/json')) {
      const json = JSON.parse(data.toString('utf8'));
      return JSON.stringify(json, null, 2);
    } else if (contentType.startsWith('text/')) {
      return data.toString('utf8').trim();
    } else if (contentType.includes('application/pdf')) {
      return `[PDF Document] ${url}`;
    } else if (contentType.startsWith('image/')) {
      return `[Image File] ${url}`;
    } else {
      return `[Binary File] ${url}`;
    }
  } catch (error: any) {
    console.error(`Error fetching file from ${url}:`, error.message || error);
    return `[Error fetching file from ${url}]`;
  }
}

// === LLM CLIENT ===
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
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
      if (ev.fileURI && ev.fileURI.startsWith('http')) {
        const content = await fetchFileContent(ev.fileURI);
        return { ...ev, content };
      }
      return ev;
    })
  );

  console.log("✅ All essential data fetched.");

  const systemPrompt = `You are a fair and impartial arbitrator tasked with analyzing dispute evidence and making well-reasoned decisions. Consider all evidence carefully, weigh the credibility of sources, and provide clear justification for your conclusions.`;
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Please analyze this dispute case and select the most appropriate resolution from the available options.\n\nDispute ID: ${dispute.id}\nCourt: ${dispute.court.id}\nPolicy: ${dispute.court.policy}\nPeriod: ${dispute.period}\n\nAvailable Answers:\n${JSON.stringify(parsedTemplate.answers, null, 2)}\n\nFollow these steps in your analysis: 1) Review evidence; 2) Evaluate timeline; 3) Assess validity; 4) Provide JSON with 
      - A vote object containing the selected answer's id, title, and description
      - A detailed justification explaining your reasoning
      - Specific references to key evidence that influenced your decision
      .`
    }
  ];

  // Append each evidence as either text or image_url
  evidenceContents.forEach(ev => {
    if (ev.content.startsWith('[Image File]') || ev.content.startsWith('[PDF Document]')) {
      // For images or PDFs, send the link as an image_url block
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Evidence (${ev.id}): ${ev.description}` },
          { type: "image_url", image_url: { url: ev.fileURI } }
        ]
      });
    } else if (ev.content.startsWith('[Binary File]') || ev.content.startsWith('[Error')) {
      // Fallback: just pass the placeholder text
      messages.push({
        role: "user",
        content: `Evidence (${ev.id}): ${ev.description}\n${ev.content}`
      });
    } else {
      // Inline plain/text or JSON content
      messages.push({
        role: "user",
        content: `Evidence (${ev.id}): ${ev.description}\n${ev.content}`
      });
    }
  });

  console.log("⏳ Sending to LLM for analysis...");
  const completion = await openai.chat.completions.create({
    model: "meta-llama/llama-4-maverick:free",
    messages,
    max_tokens: 1500,
    temperature: 0.5,
    response_format: { type: "json_object" },
  });

  const analysis = JSON.parse(completion.choices[0].message.content || "{}");
  console.log("LLM Analysis:", JSON.stringify(analysis, null, 2));
}

// Run with the dispute ID from CLI, defaulting to "43"
const [,, disputeID = "43"] = process.argv;
run(disputeID).catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
