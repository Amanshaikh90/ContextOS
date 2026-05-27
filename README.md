# DEVELOPER NOTE (ACTIVE TESTING PHASE)

contextOS is currently running in an active Beta evaluation phase. Data synchronization relies heavily on real-time persistent data stream channels and webhooks.

# ContextOS (Beta)

ContextOS is an AI-native VS Code sidebar extension designed to bridge the gap between your local codebase, GitHub repositories, Jira issues, and team discussions. By unifying your development workspace ecosystem, ContextOS utilizes advanced context-building intelligence to deliver real-time AI insights, pull request tracking, and task synchronization directly inside your editor.

---

## Core Features

- **AI-Powered Project Insights:** Dynamically compiles pipeline statuses, active workflows, and repository changes into human-readable project summaries.
- **Unified Sidebar Control:** Seamlessly view and manage your live Pull Requests, historical repository data, and Jira workspace tracking items without context-switching.
- **Intelligent Knowledge Backfilling:** Automatically indexes up to 5 of your most recent recent PRs into a localized context-engine to help answer complex project architecture queries instantly.
- **Multi-Platform Synchronization:** Enterprise-grade secure OAuth integration tunnels built for GitHub, Jira Cloud, and Slack.

---

## First-Time Onboarding Setup

Getting started with ContextOS takes less than two minutes:

### 1. Account Identity Initialization

When you open the extension for the first time, input your developer email to instantly synchronize your profile baseline with our secure data engine layer.

### 2. Connect Your Integrations

Click on the connection panel icons located in your sidebar to link your modern pipeline apps:

- **GitHub:** Grants secure scope access to authorized repositories via an installation picker interface.
- **Jira Cloud:** Dynamically binds project tickets to your sidebar tracking viewport after verifying your workspace app presence.
- **Slack:** Streams cross-channel team communication metrics straight into your operational view state.

---

## Self-Healing Core Architecture

ContextOS is engineered to stay performant without disrupting your local workspace cycle:

- **Cache Optimization (`skipAI` Lifecycle):** Leverages aggressive local and backend caching states when rapidly jumping across code files to maximize execution speeds and eliminate API rate limits.
- **OAuth Auto-Recovery Handler:** Built with internal token self-healing. If you ever change project bounds or manually revoke app allowances via GitHub or Atlassian profiles, ContextOS instantly sniffs out the status change, cleanses local caches, and seamlessly routes you to re-onboard without throwing system exceptions.

---

## Security & Data Encryption

We take developer privacy seriously. ContextOS protects all third-party authorization records:

- **AES-256-CBC Encryption:** All access and refresh tokens are fully encrypted via robust cryptographic signatures prior to hitting our persistent PostgreSQL backend.
- **Granular Boundary Scopes:** We only request read-level configurations specifically necessary to render pull requests, issue items, or chat logs inside your sidebars.

---

# Repair

if the Integration Viewport Freezes or Breaks:

If an API token expires, a network socket loses consensus, or a component view breaks alignment, do not close your workspace window. Use the built-in self-healing recovery triggers to force a sync:

1. Trigger Cache Eviction (Refresh): Click the Refresh Icon located at the top right of the Project Insight action bar, or run the console synchronization check. This completely forces refresh = true, invalidates stale local cache buffers, purges dead background data fragments, and re-executes the core AI pipeline generation.

2. Token Auto-Healing: If you revoked credentials externally on GitHub or Atlassian, simply click the connection button again. The backend will instantly purge the invalid PostgreSQL entity rows and safely route you through the OAuth installation drawer without throwing unexpected application crashes.

---

## Feedback & Contributions

ContextOS is currently running in active **Beta**. If you run into parsing bugs, database errors, or have feature feature feature requests, please reach out to our team or file an issue tracking item via our official portal!
