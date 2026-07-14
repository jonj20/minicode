/**
 * Preset workflow scripts — ready-to-use orchestration patterns.
 */

export const CODE_REVIEW = `
export const meta = {
  name: 'code_review',
  description: 'Multi-angle parallel code review with verification',
  phases: [
    { title: 'Collect diff' },
    { title: 'Parallel review' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

phase('Collect diff')
const diff = await agent('Read the current git diff (git diff HEAD). Return the full diff text.', {
  label: 'collect diff',
})

phase('Parallel review')
const [correctness, security, performance, style] = await parallel([
  () => agent('Review for correctness: logic errors, off-by-one, null handling. Diff:\\n' + diff, { label: 'correctness' }),
  () => agent('Review for security: injection, auth bypass, secrets. Diff:\\n' + diff, { label: 'security' }),
  () => agent('Review for performance: O(n^2), memory leaks, unnecessary allocations. Diff:\\n' + diff, { label: 'performance' }),
  () => agent('Review for style: naming, duplication, complexity. Diff:\\n' + diff, { label: 'style' }),
])

phase('Verify')
const findings = [correctness, security, performance, style].filter(Boolean).join('\\n---\\n')
const verified = await agent('Cross-check these review findings. Remove false positives, rank by severity:\\n' + findings, {
  label: 'verify findings',
})

phase('Synthesize')
return await agent('Produce a concise code review report with severity-ranked findings:\\n' + verified, {
  label: 'final report',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      critical: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
      suggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary'],
  },
})
`;

export const DEEP_RESEARCH = `
export const meta = {
  name: 'deep_research',
  description: 'Research a question from multiple angles with source verification',
  phases: [
    { title: 'Search' },
    { title: 'Analyze' },
    { title: 'Verify' },
    { title: 'Report' },
  ],
}

const question = args?.question ?? 'general research'

phase('Search')
const [web, docs, code] = await parallel([
  () => agent('Search the web for information about: ' + question, { label: 'web search' }),
  () => agent('Search documentation and technical resources about: ' + question, { label: 'docs search' }),
  () => agent('Search the codebase for relevant code related to: ' + question, { label: 'code search' }),
])

phase('Analyze')
const sources = [web, docs, code].filter(Boolean).join('\\n---\\n')
const analysis = await agent('Analyze and synthesize these sources:\\n' + sources, { label: 'synthesis' })

phase('Verify')
const verified = await agent('Fact-check this analysis. Flag any unsupported claims:\\n' + analysis, {
  label: 'verification',
})

phase('Report')
return await agent('Write a comprehensive research report based on verified findings:\\n' + verified, {
  label: 'final report',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      findings: { type: 'array', items: { type: 'string' } },
      sources: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string' },
    },
    required: ['summary', 'findings'],
  },
})
`;

export const ADVERSARIAL_REVIEW = `
export const meta = {
  name: 'adversarial_review',
  description: 'Investigate a claim, then attempt to refute each finding',
  phases: [
    { title: 'Investigate' },
    { title: 'Adversarial check' },
    { title: 'Synthesize' },
  ],
}

const claim = args?.claim ?? 'investigate the current state'

phase('Investigate')
const findings = await agent('Investigate thoroughly: ' + claim + '. List all findings with evidence.', {
  label: 'initial findings',
})

phase('Adversarial check')
const challenges = await parallel([
  () => agent('Play devil\\'s advocate. Find flaws, counter-evidence, or alternative explanations in these findings:\\n' + findings, { label: 'challenger' }),
  () => agent('Verify each factual claim in these findings. Mark unsupported ones:\\n' + findings, { label: 'fact checker' }),
  () => agent('Consider edge cases and boundary conditions that might invalidate these findings:\\n' + findings, { label: 'edge cases' }),
])

phase('Synthesize')
return await agent('Produce a balanced verdict considering both findings and challenges:\\nFindings:\\n' + findings + '\\nChallenges:\\n' + challenges.filter(Boolean).join('\\n'), {
  label: 'final verdict',
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string' },
      supported: { type: 'array', items: { type: 'string' } },
      refuted: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string' },
    },
    required: ['verdict'],
  },
})
`;

export const MULTI_PERSPECTIVE = `
export const meta = {
  name: 'multi_perspective',
  description: 'Analyze a topic from multiple independent angles, then synthesize',
  phases: [
    { title: 'Parallel analysis' },
    { title: 'Synthesize' },
  ],
}

const topic = args?.topic ?? 'analyze this topic'
const perspectives = args?.perspectives ?? ['technical', 'business', 'user', 'security']

phase('Parallel analysis')
const analyses = await parallel(
  perspectives.map(p => () => agent('Analyze from ' + p + ' perspective: ' + topic, { label: p }))
)

phase('Synthesize')
return await agent('Synthesize these perspectives into a balanced analysis:\\n' + analyses.filter(Boolean).join('\\n---\\n'), {
  label: 'synthesis',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      perspectives: { type: 'object' },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary'],
  },
})
`;

export const CODEBASE_AUDIT = `
export const meta = {
  name: 'codebase_audit',
  description: 'Run parallel checks across a codebase scope, then cross-validate',
  phases: [
    { title: 'Parallel audit' },
    { title: 'Cross-validate' },
    { title: 'Report' },
  ],
}

const scope = args?.scope ?? 'src/'
const checks = args?.checks ?? ['error handling', 'unused code', 'inconsistent patterns']

phase('Parallel audit')
const results = await parallel(
  checks.map(c => () => agent('Audit ' + scope + ' for: ' + c + '. List specific files and line numbers.', { label: c }))
)

phase('Cross-validate')
const validated = await agent('Cross-validate these audit results. Remove duplicates, confirm real issues:\\n' + results.filter(Boolean).join('\\n---\\n'), {
  label: 'cross-validate',
})

phase('Report')
return await agent('Produce a prioritized audit report:\\n' + validated, {
  label: 'audit report',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      issues: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, severity: { type: 'string' }, description: { type: 'string' } } } },
    },
    required: ['summary', 'issues'],
  },
})
`;

export const IMPLEMENTATION = `
export const meta = {
  name: 'implementation',
  description: 'Plan, implement, test, and verify a feature or bugfix',
  phases: [
    { title: 'Explore' },
    { title: 'Plan' },
    { title: 'Implement' },
    { title: 'Test' },
    { title: 'Verify' },
  ],
}

const task = args?.task ?? 'implement the requested change'

phase('Explore')
const context = await agent('Explore the codebase to understand the relevant files, patterns, and architecture for: ' + task + '. Return: 1) affected files, 2) existing patterns to follow, 3) potential risks.', {
  label: 'explore context',
})

phase('Plan')
const plan = await agent('Based on this exploration, create a detailed implementation plan:\\n' + context + '\\n\\nTask: ' + task, {
  label: 'create plan',
  schema: {
    type: 'object',
    properties: {
      steps: { type: 'array', items: { type: 'string' } },
      files_to_modify: { type: 'array', items: { type: 'string' } },
      tests_needed: { type: 'array', items: { type: 'string' } },
    },
    required: ['steps', 'files_to_modify'],
  },
})

phase('Implement')
const implementation = await parallel([
  () => agent('Implement the following plan. Make all necessary code changes:\\n' + JSON.stringify(plan, null, 2) + '\\n\\nContext:\\n' + context, { label: 'write code' }),
])

phase('Test')
const testResults = await agent('Write and run tests for the changes. Report pass/fail and any issues:\\n' + JSON.stringify(plan, null, 2), {
  label: 'run tests',
})

phase('Verify')
return await agent('Verify the implementation is complete and correct:\\nPlan: ' + JSON.stringify(plan) + '\\nTests: ' + testResults, {
  label: 'verify',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      files_changed: { type: 'array', items: { type: 'string' } },
      tests_passing: { type: 'boolean' },
      notes: { type: 'string' },
    },
    required: ['summary', 'tests_passing'],
  },
})
`;

export const BUGFIX = `
export const meta = {
  name: 'bugfix',
  description: 'Diagnose, fix, and verify a bug',
  phases: [
    { title: 'Diagnose' },
    { title: 'Fix' },
    { title: 'Test' },
    { title: 'Verify' },
  ],
}

const bug = args?.bug ?? 'diagnose and fix the bug'

phase('Diagnose')
const diagnosis = await agent('Investigate this bug thoroughly. Find root cause, affected files, and error patterns:\\n' + bug, {
  label: 'diagnose',
  schema: {
    type: 'object',
    properties: {
      root_cause: { type: 'string' },
      affected_files: { type: 'array', items: { type: 'string' } },
      error_pattern: { type: 'string' },
      fix_strategy: { type: 'string' },
    },
    required: ['root_cause', 'fix_strategy'],
  },
})

phase('Fix')
const fix = await agent('Apply the fix based on this diagnosis:\\n' + JSON.stringify(diagnosis, null, 2), {
  label: 'apply fix',
})

phase('Test')
const tests = await agent('Write a regression test for this bug and run it. Verify the fix works:\\n' + JSON.stringify(diagnosis, null, 2), {
  label: 'regression test',
})

phase('Verify')
return await agent('Verify the fix is complete and no regressions:\\nDiagnosis: ' + JSON.stringify(diagnosis) + '\\nTest results: ' + tests, {
  label: 'verify fix',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      root_cause: { type: 'string' },
      fix_applied: { type: 'string' },
      tests_passing: { type: 'boolean' },
    },
    required: ['summary', 'tests_passing'],
  },
})
`;

export const REFACTOR = `
export const meta = {
  name: 'refactor',
  description: 'Analyze, plan, and execute a safe refactoring',
  phases: [
    { title: 'Analyze' },
    { title: 'Plan' },
    { title: 'Refactor' },
    { title: 'Verify' },
  ],
}

const target = args?.target ?? 'refactor the specified code'

phase('Analyze')
const analysis = await agent('Analyze the code to refactor. Identify dependencies, patterns, and risks:\\n' + target, {
  label: 'analyze code',
})

phase('Plan')
const plan = await agent('Create a safe refactoring plan that preserves behavior:\\n' + analysis, {
  label: 'refactor plan',
  schema: {
    type: 'object',
    properties: {
      goal: { type: 'string' },
      steps: { type: 'array', items: { type: 'string' } },
      files_affected: { type: 'array', items: { type: 'string' } },
      behavioral_changes: { type: 'array', items: { type: 'string' } },
    },
    required: ['goal', 'steps'],
  },
})

phase('Refactor')
const result = await agent('Execute the refactoring plan step by step. Ensure behavior is preserved:\\n' + JSON.stringify(plan, null, 2), {
  label: 'execute refactor',
})

phase('Verify')
return await agent('Verify the refactoring: same behavior, cleaner code, tests pass:\\n' + JSON.stringify(plan) + '\\n\\nResult: ' + result, {
  label: 'verify refactor',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      files_changed: { type: 'array', items: { type: 'string' } },
      behavior_preserved: { type: 'boolean' },
      tests_passing: { type: 'boolean' },
    },
    required: ['summary', 'behavior_preserved'],
  },
})
`;

/** All preset workflows indexed by name. */
export const PRESETS: Record<string, string> = {
	code_review: CODE_REVIEW,
	deep_research: DEEP_RESEARCH,
	adversarial_review: ADVERSARIAL_REVIEW,
	multi_perspective: MULTI_PERSPECTIVE,
	codebase_audit: CODEBASE_AUDIT,
	implementation: IMPLEMENTATION,
	bugfix: BUGFIX,
	refactor: REFACTOR,
};

export const PRESET_NAMES = Object.keys(PRESETS);
