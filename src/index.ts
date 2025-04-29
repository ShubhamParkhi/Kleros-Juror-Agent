import { GraphQLClient } from 'graphql-request';
import { ethers } from 'ethers';
import { config } from './config';
import { DisputeProcessor } from './services/DisputeProcessor';

const MAIN_SUBGRAPH = config.SUBGRAPH_URL;
const TEMPLATE_SUBGRAPH = config.TEMPLATE_SUBGRAPH_URL;
const JUROR = config.JUROR_ADDRESS.toLowerCase();
const POLL_MS = config.POLL_INTERVAL_MS;

const mainClient = new GraphQLClient(MAIN_SUBGRAPH);
const tplClient = new GraphQLClient(TEMPLATE_SUBGRAPH);
const provider = new ethers.JsonRpcProvider(config.RPC_URL);

const processor = new DisputeProcessor(mainClient, tplClient, provider, JUROR);

processor.processNextDispute().catch(console.error);
setInterval(() => processor.processNextDispute().catch(console.error), POLL_MS);
