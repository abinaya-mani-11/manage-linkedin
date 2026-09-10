# Graph Report - manage-linkedin  (2026-09-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 81 nodes · 76 edges · 12 communities (8 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.9)
- Token cost: 362 input · 116 output

## Graph Freshness
- Built from commit: `8c7f934f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Project Metadata and Dependencies
- TypeScript Compiler Options
- Development Dependencies
- Next.js App Configuration
- Application Runtime Dependencies
- Project Documentation and Roadmap
- Project Scripts
- API Route Handlers
- AI Agent Instructions
- TypeScript File Inclusion
- ESLint Configuration
- PostCSS Configuration

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `scripts` - 5 edges
3. `next` - 3 edges
4. `Project Overview` - 3 edges
5. `lucide-react` - 2 edges
6. `react` - 2 edges
7. `groq-sdk` - 2 edges
8. `Future Roadmap` - 2 edges
9. `Humanizer Logic` - 2 edges
10. `Claude Project Rules` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Post Creator UI Screenshot` --conceptually_related_to--> `Humanizer Logic`  [INFERRED]
  public/screenshot_demo.png → README.md
- `Claude Project Rules` --references--> `Graphify Skill Definition`  [INFERRED]
  CLAUDE.md → .claude/skills/graphify/SKILL.md
- `Claude Project Rules` --references--> `Next.js Agent Rules`  [EXTRACTED]
  CLAUDE.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **LinkedIn Post Generation Flow** — readme_readme, public_screenshot_demo, readme_humanizer [EXTRACTED 0.90]

## Communities (12 total, 4 thin omitted)

### Community 0 - "Project Metadata and Dependencies"
Cohesion: 0.12
Nodes (14): name, private, version, eslint, eslint-config-next, lucide-react, react, react-dom (+6 more)

### Community 1 - "TypeScript Compiler Options"
Cohesion: 0.12
Nodes (16): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+8 more)

### Community 2 - "Development Dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 3 - "Next.js App Configuration"
Cohesion: 0.25
Nodes (5): nextConfig, next, geistMono, geistSans, metadata

### Community 4 - "Application Runtime Dependencies"
Cohesion: 0.33
Nodes (6): dependencies, groq-sdk, lucide-react, next, react, react-dom

### Community 5 - "Project Documentation and Roadmap"
Cohesion: 0.33
Nodes (6): Post Creator UI Screenshot, Backend Stack, Frontend Stack, Future Roadmap, Humanizer Logic, Project Overview

### Community 6 - "Project Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 8 - "AI Agent Instructions"
Cohesion: 0.67
Nodes (3): Next.js Agent Rules, Claude Project Rules, Graphify Skill Definition

## Knowledge Gaps
- **58 isolated node(s):** `name`, `private`, `version`, `eslint`, `eslint-config-next` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 63 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Development Dependencies` to `Project Metadata and Dependencies`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `next` connect `Next.js App Configuration` to `Project Metadata and Dependencies`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Application Runtime Dependencies` to `Project Metadata and Dependencies`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Metadata and Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `TypeScript Compiler Options` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._