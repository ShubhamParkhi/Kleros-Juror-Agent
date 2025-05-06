# TypeScript Bot Project

A TypeScript-based bot project with GraphQL and OpenAI integration.

## Project Overview

This project is a TypeScript application that utilizes GraphQL for data querying and OpenAI's API for AI capabilities.

## Prerequisites

- Node.js (Latest LTS version recommended)
- npm (comes with Node.js)

## Dependencies

### Production Dependencies
- graphql-request: ^7.1.2
- openai: ^4.97.0

### Development Dependencies
- typescript: ^5.8.3
- @types/node: ^22.15.3

## Installation

```bash
npm install
```

## Scripts

- `npm run build` - Compiles TypeScript code to JavaScript
- `npm start` - Runs the compiled application
- `npm test` - Runs tests (currently not configured)

## Project Structure

```
bot/
├── src/           # Source code directory
├── dist/          # Compiled JavaScript output
├── package.json   # Project dependencies and scripts
├── tsconfig.json  # TypeScript configuration
└── README.md      # Project documentation
```

## Development

The project uses TypeScript for type-safe development. The compiled output is directed to the `dist` directory as configured in `tsconfig.json`.

## License

ISC