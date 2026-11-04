# Ma Santé Tranquille — Clara

**By team Médecins Sans Tokens**

---

## Overview

Ma Santé Tranquille is an AI-powered public health dashboard designed for epidemic crisis situations. It provides citizens with real-time epidemic indicators and a conversational health assistant — **Clara** — that guides them through three key actions: checking the current health situation, finding a nearby testing center, and booking a doctor appointment.

The agent is built on the [Mastra](https://mastra.ai) framework and powered by Claude (Anthropic). It is designed to be deployed as a lightweight, self-contained container with a built-in web frontend.

---

## Features

### Live Epidemic Dashboard
- National alert level (Low / Moderate / High / Critical)
- Key indicators: positivity rate, hospitalizations, vaccination coverage
- Data sourced from **Santé Publique France** (official national health agency), with realistic fallback data when the API is unavailable

### Clara — Health Assistant
Clara is the conversational AI at the heart of the agent. She:
- **Responds in the user's language** (French, English, or any other language)
- Fetches live epidemic stats before answering any situation-related question
- Helps users find the nearest pharmacy or testing center by city or postal code
- Searches for available doctors on Doctolib and surfaces appointment slots
- Never gives personal medical advice — she informs and directs only
- Always routes emergencies to **15 (SAMU)** or **112**

### Quick-Action Tiles
Three one-tap cards on the homepage send a pre-filled message to Clara:
- **Get Tested** — find a nearby pharmacy or testing center
- **See a Doctor** — book an appointment via Doctolib
- **Current Measures** — get the latest health recommendations

---

## API specs (Fabric routes)

The three APIs Clara uses are described by OpenAPI specs in [`specs/`](specs/). Fabric imports them as governed services, and the same specs power the Postman workspace and the Fern portal.

| Spec | Journey step |
|------|--------------|
| `specs/health-surveillance.openapi.yaml` | Local health trends by postal code |
| `specs/pharmacies.openapi.yaml` | Nearby pharmacies, on-duty pharmacy, test booking |
| `specs/appointments.openapi.yaml` | Practitioners, slots, appointment booking |

Astro blueprint name: `healthcare-ma-sante-tranquille` (hackathon naming rule `<industry>-<use case>`). Models go through the Astro Gateway or Fabric, never directly to a model provider.

---

## Hackathon stack and links

Team repo: https://github.com/postman-solutions-eng/hackathon-mst-agent. Clara runs on **Astro**. Every LLM, MCP and API call is meant to go through **Fabric**. The three APIs are described once (`specs/`) and reused everywhere:

| Product | What it holds | Link |
|---------|---------------|------|
| AWS | The three demo APIs (one Lambda behind API Gateway), Terraform in [`infra/`](infra/) with shared state in S3 | `https://yyw2lxe0fl.execute-api.us-east-1.amazonaws.com` (`/surveillance/v1`, `/pharmacies/v1`, `/appointments/v1`) |
| Postman | Workspace "Ma Santé Tranquille – Hackathon Médecins Sans Tokens" (team Field Services v12): specs, generated collections, mocks, `… – AWS` and `… – Mock` environments, monitors every 6 hours | API Catalog system environment "MST Hackathon (AWS)" |
| Fern | API portal and Clara's workflows, published from the Fern repo branch `ma-sante-tranquille-hackathon` | https://ma-sante-tranquille.docs.buildwithfern.com, MCP server `/_mcp/server` (`searchDocs`) |
| GitHub Actions | [`deploy-and-test`](.github/workflows/deploy-and-test.yml): Terraform deploy through the OIDC role `mst-github-deploy`, Postman collection runs against AWS, New Relic deployment marker when configured | Secrets: `POSTMAN_API_KEY`; optional `NEW_RELIC_API_KEY` + variable `NEW_RELIC_ENTITY_GUID` |

Demo rules served by the AWS APIs: `prac-003` has no slot, a social security number sent in clear returns `422`, a booking without `patient_confirmed: true` returns `428`.

> Status: the agent's tools below still call their original sources (Santé publique France open data, OpenStreetMap, a simulated Doctolib). Pointing them at the AWS APIs through Fabric, and reading the workflows from the Fern MCP server, is the next step.

---

## Tools

| Tool | Description |
|------|-------------|
| `get-pandemic-stats` | Fetches national epidemic statistics |
| `get-alert-level` | Returns the current national alert level and its meaning |
| `get-regional-breakdown` | Provides regional epidemic data |
| `find-nearest-pharmacy` | Locates testing centers and pharmacies by location |
| `search-doctors` | Searches for available doctors on Doctolib |
| `get-appointment-slots` | Retrieves available appointment slots for a given doctor |

Optional MCP integrations: **openGovData** (data.gouv.fr / SPF) and **Doctolib API**.

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Auto-injected by Astro | Claude API key |
| `GOV_DATA_MCP_URL` | Optional | MCP server URL for openGovData |
| `GOV_DATA_MCP_TOKEN` | Optional | Auth token for openGovData MCP |
| `DOCTOLIB_MCP_URL` | Optional | Doctolib MCP server URL |
| `DOCTOLIB_API_KEY` | Optional | Doctolib API key |
| `FABRIC_BASE_URL` | Optional | Anthropic-compatible gateway URL |
| `FABRIC_GATEWAY_KEY` | Optional | Gateway authentication key |

---

## Safety & Compliance

- Clara never formulates personal medical opinions
- All epidemic data is sourced from official French public health authorities
- Emergency numbers (15, 112, 3114) are surfaced proactively when appropriate
- Users are referred to official resources: `sante.fr`, `solidarites-sante.gouv.fr`

---

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Agent framework**: [Mastra](https://mastra.ai)
- **LLM**: Claude (Anthropic) via Astro model injection
- **Frontend**: HTML5 UP Prologue template, custom CSS, vanilla JS
- **Deployment**: Docker on Astropods
