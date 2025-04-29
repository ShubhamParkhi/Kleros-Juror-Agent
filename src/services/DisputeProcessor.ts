import { GraphQLClient } from "graphql-request";
import { ethers } from "ethers";
import { withRetry } from "../utils/retry";
import { makeDecision } from "../agent/decisionMaker";
import { submitRuling } from "../agent/rulingSubmitter";
import {
  GET_DRAWS,
  GET_DETAILS,
  GET_EVIDENCE,
  GET_TEMPLATE,
} from "../graphql/queries";

export class DisputeProcessor {
  constructor(
    private mainClient: GraphQLClient,
    private tplClient: GraphQLClient,
    private provider: ethers.Provider,
    private jurorAddress: string
  ) {}

  async processNextDispute(): Promise<void> {
    const { draws } = await withRetry(() =>
      this.mainClient.request<{ draws: { dispute: { id: string } }[] }>(
        GET_DRAWS,
        { juror: this.jurorAddress }
      )
    );
    if (!draws.length) return;

    const disputeId = draws[0].dispute.id;
    console.log(`→ Dispute ${disputeId}`);

    const { dispute } = await withRetry(() =>
      this.mainClient.request<{ dispute: any }>(GET_DETAILS, { id: disputeId })
    );
    if (dispute.court.id !== "31" || dispute.period !== "vote") return;

    const { evidences } = await withRetry(() =>
      this.mainClient.request<{ evidences: any[] }>(GET_EVIDENCE, { disputeId })
    );

    let templateData = "";
    if (dispute.templateId) {
      const tpl = await withRetry(() =>
        this.tplClient.request<{ disputeTemplate: { templateData: string } }>(
          GET_TEMPLATE,
          { id: dispute.templateId.toString() }
        )
      );
      templateData = tpl.disputeTemplate.templateData;
    }

    const evidenceText = evidences
      .map((ev) => {
        let uri = ev.evidence;
        if (uri.startsWith("ipfs://"))
          uri = `https://ipfs.io/ipfs/${uri.slice(7)}`;
        return `• [${new Date(+ev.timestamp * 1000).toISOString()}] ${
          ev.description || ev.name
        }\n  (${uri})`;
      })
      .join("\n");

    const prompt = `
Dispute #${dispute.disputeID} (Court 31, Round ${dispute.currentRound.id} – ${
      dispute.currentRound.nbVotes
    } votes)

Evidence:
${evidenceText}

${templateData ? `Template Data:\n${templateData}` : ""}
    `.trim();

    const ruling = await makeDecision(prompt);
    console.log(`⏳ Ruling: ${ruling}`);

    await submitRuling(this.provider, Number(dispute.disputeID), ruling);
    console.log(`✅ Submitted ruling ${ruling}`);
  }
}
