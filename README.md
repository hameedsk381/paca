<p align="center">
  <img src="docs/assets/paca-logo.svg" alt="Paca logo" width="414" />
</p>

<h1 align="center">Paca</h1>

<p align="center"><strong>The open-source, AI-native alternative to Jira, ClickUp, and Monday.</strong></p>

<p align="center">
  A collaborative task management engine designed specifically for Scrum teams.<br />
  Where Human Intelligence and AI Agents work side-by-side on a single board.
</p>

<p align="center">
  <a href="docs/guides/getting-started.md">Getting Started</a>
  ·
  <a href="docs/architecture/overview.md">Architecture</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
  ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## Why Paca?

Traditional project management tools like Jira or ClickUp were built before the AI revolution. They treat AI as a "plugin" or a "chatbot" on the side. 

**Paca is different.** It is built from the ground up to treat AI Agents as **first-class team members**. In Paca, a Scrum team consists of both humans and AI, sharing the same backlog, the same Scrumban board, and the same objectives.

## Key Collaborative Pillars

### 1. Unified Teamwork (Human-in-the-Loop)
Paca doesn't replace humans; it augments the team. Whether it's a Product Owner drafting stories or a Developer writing code, tasks can be assigned to either a human or an AI Agent. The human remains the orchestrator, reviewing and refining AI output within the natural Scrum flow.

### 2. Documentation-First (BDD & SDD)
Collaboration often fails because of fragmented context. Paca centralizes the source of truth:
* **BDD (Behavior-Driven Development):** Align POs, BAs, and Agents through Gherkin-style scenarios.
* **SDD (System Design Document):** A dedicated module for technical design and documentation. By keeping docs on Paca instead of buried in source code, non-tech stakeholders (and AI Agents) stay perfectly in sync without needing to parse complex Git repos.

### 3. Server-Side Agent Execution
Unlike "Local-first" tools, Paca's agents run directly on your server. This ensures that the entire team shares the same environment, logs, and progress, making it a true enterprise-ready collaborative platform.

---

## Comparison: Paca vs. Others

| Feature | Paca | Multica | Paperclip |
| :--- | :--- | :--- | :--- |
| **Primary Use Case** | Team Collaboration (Scrum/Kanban) | Personal AI Research/Dev | AI-assisted Coding |
| **Workflow** | **Human-in-the-loop** (Team-centric) | Solo-user (Agent-centric) | Individual Developer |
| **Target Audience** | Cross-functional Teams (PO/BA/Dev/QA) | Power Users / Researchers | Software Engineers |
| **Architecture** | BDD & SDD Integrated | Multi-agent Swarm | Context-aware Chat |
| **Management** | Jira/ClickUp Alternative | Browser/Desktop Tool | VS Code Extension |

---

## The P-A-C-A Cycle

1. **Plan**: Draft User Stories (BDD) and System Designs (SDD).
2. **Act**: Execute tasks. Humans and Agents pick up tickets from the Scrumban board.
3. **Check**: Continuous verification via automated QA agents and human review.
4. **Adapt**: Retrospectives driven by data-driven insights from the previous sprint.

## Features

- **AI-PO & BA Support**: Transform raw ideas into structured BDD scenarios and Acceptance Criteria.
- **SDD Management**: Build and maintain system architecture docs that both humans and Agents can read and update.
- **Unified Scrumban Board**: Real-time status updates for all team members (Carbon-based or Silicon-based).
- **Open Source**: Complete control over your data and your AI orchestration.

## The "Paca" Story

Why the name Paca? It started as a small pun on the Japanese word **"Baka" (ばか)**, meaning "silly." 

When we started, our AI assistants would often "hallucinate" or act a bit silly. Instead of getting frustrated, we embraced it. Building a comprehensive management engine as an open-source project is also, in a way, a "silly" endeavor in a world of massive SaaS corporations. 

Paca is a passion project. We’re building it because we believe the future of work isn't just humans using AI, but humans and AI working together as a team. 🦙

## Documentation Map

- [CONTRIBUTING.md](CONTRIBUTING.md): How to contribute.
- [docs/README.md](docs/README.md): Documentation index.
- [docs/architecture/overview.md](docs/architecture/overview.md): System design.

## License

Distributed under the **Apache License 2.0**.
