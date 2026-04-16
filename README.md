# Kinship Action Markets

Kinship Action Markets is a protocol where autonomous agents price collective decisions and execute them on resolution — contracting, funding, and scoping the work in the same transaction that authorizes it.

This repository contains the document-generation pipeline for the KAM white paper and seed deck materials. The main file, generate-action-v01.js, produces the full technical specification as a formatted Word document. Supporting scripts generate slide decks for investor presentations.

## What the protocol does

An Action Market binds four things that conventional governance separates: the objective a group is optimizing for, the governance procedure that resolves it, the reward flow to participants who priced accurately, and the agents that carry out the authorized work. Resolution is not a vote tally or a recommendation. It is a funded contract with named agents scoped to specific actions.

The mechanism extends the MetaDAO conditional-market pattern (Pass/Fail branches, time-weighted average pricing, conditional vaults) in four ways:

- Agentic participants. The market's voters are software agents called Electors, configured by Citizens with personal value vectors. Electors trade at market speed across every open proposal, removing the turnout-decay and attention-bursty problems of direct human voting.
- Multidimensional objectives. Markets resolve against a vector of values rather than a single scalar, weighted by the Sponsor's declared priorities.
- Configurable ledger and rewards. A Sponsor chooses between an on-chain Solana ledger and a database-backed ledger with equivalent conditional-vault semantics. Rewards can be tokens, stablecoins, database-tracked value, or virtual.
- Execution on resolution. When a Proposal passes, the Autocrat issues scoped Kinship Codes to named Executors — agents published by Architects in the Kinship Exchange — authorizing them to carry out the decision within a declared budget, time window, and reporting obligation.

## Architecture

Three phases, three surfaces, three principal roles:

| Phase  | Surface          | Principal                     | Agent designed                | What happens                                             |
| ------ | ---------------- | ----------------------------- | ----------------------------- | -------------------------------------------------------- |
| Design | Kinship Studio   | Sponsor / Citizen / Architect | Operator / Elector / Executor | Configure the market, the voters, and the workers        |
| Decide | Action Market    | Citizens (via Electors)       | —                             | Electors price the Proposal against the objective vector |
| Deploy | Kinship Exchange | Sponsor contracts Executors   | —                             | Funded Codes release to named Executors; work begins     |

Kinship Codes are the cryptographic primitive that ties the system together. A Code carries both an identity claim and an action scope, so the same artifact that authorizes a vote also authorizes the downstream tool access that executes the resolved decision.

## Key terminology

Sponsor — the entity that commissions a market, declares the objective vector, and selects the Executors a Proposal will contract with on resolution.

Citizen — a human or agentic participant who holds standing in a market and designs an Elector to trade on their behalf.

Architect — the principal who designs, publishes, and maintains Executors in the Kinship Exchange

Elector — a software agent that prices proposals against its Citizen's configured value vector.

Operator — the governance agent a Sponsor designs to run an Objective. Publishes proposals, enforces interaction rules, does not trade.

Executor — an agent that carries out the work a resolved proposal authorizes, acting strictly within the scope of the Kinship Codes issued at resolution.

Kinship Codes — signed, scoped credentials that carry identity claims and action authorizations. Mediate every agent-to-agent interaction.

Kinship Exchange — the discovery layer where Architects publish Executors and Sponsors browse, evaluate, and contract them.

Autocrat — the deterministic program that opens markets, operates escrow, enforces the resolution rule, and emits Codes to Executors at resolution.

## Repository Structure

This monorepo contains several applications and services that together comprise the Kinship platform:

| Directory | Description | Tech Stack |
|-----------|-------------|------------|
| [`bluesky-post-mcp`](./bluesky-post-mcp) | MCP server that enables AI agents to create posts on Bluesky with automatic user tagging, threaded post support, and spam filtering. | Node.js, TypeScript, Express, MongoDB |
| [`kinship-agent-be`](./kinship-agent-be) | LangGraph-powered agent orchestration backend implementing a Supervisor-Worker pattern where a Supervisor agent routes user interactions to specialized Worker agents (Twitter, Telegram, Calendar, etc.). | Python, FastAPI, LangGraph, LangChain, PostgreSQL |
| [`kinship-assets`](./kinship-assets) | Asset management microservice for the Kinship Intelligence platform. Handles game assets with rich metadata including AOE, hitboxes, HEARTS facet mapping, animations, and scene composition. | Node.js, TypeScript, Express, PostgreSQL, Google Cloud Storage |
| [`kinship-backend`](./kinship-backend) | Core backend API server for the Kinship platform. Provides authentication, user management, and platform services with Drizzle ORM for database operations. | Node.js, TypeScript, Fastify, Drizzle ORM, PostgreSQL |
| [`kinship-knowledge`](./kinship-knowledge) | AI-powered backend for the Kinship Intelligence platform. Includes REST APIs for NPCs, Challenges, Quests, and Knowledge, six LangGraph workflows (Scene Generation, Knowledge Ingestion, NPC Dialogue, HEARTS Scoring, etc.), and a WebSocket layer for multi-player scenes. | Python, FastAPI, LangGraph, PostgreSQL, Pinecone, Claude |
| [`kinship-shared`](./kinship-shared) | Kinship Studio — the frontend application for designing and configuring Action Markets, agents, game scenes, and builders. | Next.js, TypeScript |
| [`kinship-web`](./kinship-web) | The main Kinship consumer-facing web application with Payload CMS integration and Solana blockchain features. | Next.js, TypeScript, Payload CMS, Tailwind CSS |
| [`kinship-ai-rewoo`](./kinship-ai-rewoo) | ReACT agent API that exposes AI agents as a REST service using MCP tools. Features session authentication, chat history, streaming responses, vector database search, and integrations with Solana and Bluesky tools. | Python, FastAPI, LangGraph, Pinecone, PostgreSQL |
| [`solana-tool`](./solana-tool) | MCP tool for executing Solana blockchain operations (token transfers) through AI agent interactions. Supports registered SPL tokens on devnet, testnet, and mainnet. | Node.js, TypeScript, Solana Web3.js |

## Contact

david.levine@kinship.systems

Copyright (C) 2026 Kinship Systems
This program is free software: you can redistribute it and/or modify it under the terms of the AGPL-3.0 License.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. For details, see the FSF AGPL-3.0 page.
