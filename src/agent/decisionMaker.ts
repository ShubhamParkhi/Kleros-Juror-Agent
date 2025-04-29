import { OpenAI } from 'openai';
import { config } from '../config';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export async function makeDecision(prompt: string): Promise<number> {
  const system = 'You are a Kleros juror AI. Think step-by-step and output JSON: {"ruling":<number>, "justification":<string>}';
  const res = await openai.chat.completions.create({
    model: config.OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
  });
  const text = res.choices[0]?.message?.content?.trim() || '';

  const match = text.match(/"ruling"\s*:\s*(\d+)/);
  if (!match) throw new Error(`Invalid LLM output: ${text}`);
  return Number(match[1]);
}
