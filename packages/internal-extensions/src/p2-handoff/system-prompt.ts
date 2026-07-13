/**
 * Context management system prompt primer.
 *
 * Injected via before_agent_start into the system prompt.
 * Teaches the LLM about notebook and handoff primitives.
 * Adaptive thresholds based on model context window.
 */

export const CONTEXT_PRIMER = `
## Context management

One context, one job. When the job changes or context degrades, call handoff.

### Notebook — durable cross-context grounding
Each page covers one subject. Store reusable knowledge: facts, architecture,
decisions, constraints. Use notebook_index as the index, notebook_read to
open pages on demand. Never pre-load bodies into prompts.

### Active notebook topic
The current semantic frame. Same topic → stay focused. Different topic →
handoff. After handoff, assign a fresh topic.

### Handoff — distilled next task
Save durable knowledge to notebook first, then draft a brief with current
state, blockers, next steps. Reference notebook pages by name; do not
duplicate content. Handoff compacts context around the brief.
`.trim();
