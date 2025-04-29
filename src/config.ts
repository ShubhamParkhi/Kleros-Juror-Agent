import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value || defaultValue;
}

function deriveJurorAddress(privateKey: string): string {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address.toLowerCase();
}

export const config = {
  SUBGRAPH_URL: getRequiredEnv('SUBGRAPH_URL'),
  TEMPLATE_SUBGRAPH_URL: getRequiredEnv('TEMPLATE_SUBGRAPH_URL'),
  
  RPC_URL: getRequiredEnv('RPC_URL'),
  PRIVATE_KEY: getRequiredEnv('PRIVATE_KEY'),
  JUROR_ADDRESS: deriveJurorAddress(getRequiredEnv('PRIVATE_KEY')),
  KLEROS_COURT_ADDRESS: getRequiredEnv('KLEROS_COURT_ADDRESS'),
  
  POLL_INTERVAL_MS: parseInt(getOptionalEnv('POLL_INTERVAL_MS', '60000')),
  
  OPENAI_API_KEY: getRequiredEnv('OPENAI_API_KEY'),
  OPENAI_MODEL: getOptionalEnv('OPENAI_MODEL', 'gpt-4'),
};
