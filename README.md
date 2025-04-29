# Kleros Juror Agent

An automated juror agent for the Kleros court system that processes disputes and submits rulings using AI-powered decision making.

## Features

- Automated dispute processing
- AI-powered decision making using OpenAI GPT models
- Integration with Kleros court smart contracts
- GraphQL-based dispute and evidence retrieval
- Ethereum transaction management

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- Ethereum wallet with ETH for transaction fees and PNK for staking in court and to be drawn as juror
- OpenAI API key

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template and configure your settings:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` with your configuration values

## Configuration

The following environment variables need to be configured:

- `PROVIDER_URL`: Ethereum network provider URL (e.g., Infura)
- `PRIVATE_KEY`: Your Ethereum wallet private key
- `KLEROS_COURT_ADDRESS`: Kleros court smart contract address
- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_MODEL`: OpenAI model to use (e.g., gpt-4.1)
- `MAIN_SUBGRAPH_URL`: Kleros main subgraph URL
- `TPL_SUBGRAPH_URL`: Kleros templates subgraph URL

## Usage

Start the juror agent:

```bash
npm start
```

The agent will:
1. Monitor for assigned disputes
2. Process dispute evidence and template data
3. Make decisions using AI
4. Submit rulings to the Kleros court

**Note:** It is recommended to use a wallet with minimal assets for security purposes. Only keep enough ETH for transaction fees and the required PNK for staking/juror duties.
