// Builds and validates the visual execution graph for an AI agent.
// Every agent gets its own graph, derived from its profession, workflow steps,
// tools and permissions. The graph is the single source of truth for both the
// designer UI and the execution engine.

export const NODE_KINDS = [
  'start',
  'trigger',
  'input',
  'data_collection',
  'ai_processing',
  'analysis',
  'decision',
  'action',
  'integration',
  'approval',
  'output',
  'completion',
  'error_handling',
];

export const RUN = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  SKIPPED: 'SKIPPED',
};

export const MAX_NODES = 22;
export const MAX_LLM_STEPS = 8;

const text = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const listOf = (value, max = 8, itemMax = 160) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim().slice(0, itemMax))
        .filter(Boolean)
        .slice(0, max)
    : [];

/* ------------------------------------------------------------- Profiles ---- */

const PROFILES = [
  {
    key: 'hr',
    test: /human resources|\bhr\b|recruit|talent|hiring|applicant|candidate/i,
    label: 'recruitment',
    inputNoun: 'job application',
    decision: 'Does the candidate meet the requirements?',
    approval: 'Recruiter approval before the candidate is contacted',
    output: 'Candidate evaluation report',
    steps: [
      'Receive the application and its attached resume.',
      'Extract the candidate experience, skills and qualifications.',
      'Analyse the qualifications against the role requirements.',
      'Compare the candidate with the shortlist criteria.',
      'Draft the candidate evaluation report.',
      'Escalate the shortlist decision to a recruiter.',
    ],
  },
  {
    key: 'accounting',
    test: /account|tax|bookkeep|finance|audit|payroll|invoice/i,
    label: 'accounting',
    inputNoun: 'financial documents',
    decision: 'Are all transactions validated against the source documents?',
    approval: 'Accountant approval before the figures are finalised',
    output: 'Financial report with validated figures',
    steps: [
      'Receive the financial documents and receipts.',
      'Extract the transaction data from each document.',
      'Validate every transaction against its source document.',
      'Categorise the expenses into the correct accounts.',
      'Calculate the financial results for the period.',
      'Draft the financial report with the calculations.',
      'Escalate anything that needs an accountant sign-off.',
    ],
  },
  {
    key: 'healthcare',
    test: /health|clinic|medical|patient|dental|hospital|pharma/i,
    label: 'healthcare administration',
    inputNoun: 'patient inquiry',
    decision: 'Is the request inside the authorised clinical and administrative scope?',
    approval: 'Clinic staff approval before the calendar changes',
    output: 'Appointment confirmation and updated record',
    steps: [
      'Receive the patient inquiry.',
      'Retrieve only the authorised patient records.',
      'Check the clinic calendar for available slots.',
      'Propose appointment times in a formal manner.',
      'Confirm the chosen slot and prepare the calendar update.',
      'Draft the confirmation message for the patient.',
      'Escalate anything clinical or outside policy to staff.',
    ],
  },
  {
    key: 'ecommerce',
    test: /e-?commerce|product research|dropship|retail|supplier|sourcing|shop|store/i,
    label: 'e-commerce product research',
    inputNoun: 'product research request',
    decision: 'Do the findings meet the evidence standard?',
    approval: 'Owner approval before stock or spend is committed',
    output: 'Product research report with evidence',
    steps: [
      'Receive the product research request.',
      'Search the authorised supplier platforms for candidate products.',
      'Verify each product page, price and stock status.',
      'Compare supplier prices against Egyptian competitor listings.',
      'Calculate gross profit, expenses and net margin.',
      'Draft the research report with the evidence links.',
      'Escalate the sourcing decision to the owner.',
    ],
  },
  {
    key: 'legal',
    test: /legal|law|contract|compliance|counsel|paralegal/i,
    label: 'legal review',
    inputNoun: 'legal document',
    decision: 'Are the identified risks material enough to block signature?',
    approval: 'Professional legal review before the summary is released',
    output: 'Contract summary with the identified risks',
    steps: [
      'Receive the legal document.',
      'Extract the operative clauses and defined terms.',
      'Analyse the obligations, liabilities and termination terms.',
      'Identify the risks and unusual clauses.',
      'Prepare the plain-language summary.',
      'Escalate the summary for professional review.',
    ],
  },
  {
    key: 'marketing',
    test: /marketing|advertis|brand|campaign|social media|content|growth/i,
    label: 'marketing',
    inputNoun: 'campaign objective',
    decision: 'Is the campaign ready to publish?',
    approval: 'Human approval before anything is published',
    output: 'Campaign strategy and prepared content',
    steps: [
      'Receive the campaign objective.',
      'Analyse the target audience.',
      'Research the market and competing campaigns.',
      'Draft the campaign strategy.',
      'Prepare the channel content.',
      'Escalate the campaign for human approval before publishing.',
    ],
  },
  {
    key: 'general',
    test: /.*/,
    label: 'operations',
    inputNoun: 'request',
    decision: 'Does the result meet the quality bar before it leaves the agent?',
    approval: 'Owner approval before the result is used',
    output: 'Completed deliverable',
    steps: [
      'Receive the request.',
      'Collect the context needed from the business knowledge.',
      'Do the work described in the request.',
      'Check the result against the requirements.',
      'Prepare the deliverable.',
      'Escalate anything uncertain to a human.',
    ],
  },
];

function profileFor(agent) {
  const hay = [
    agent.industry,
    agent.specialization,
    agent.agent_title,
    agent.role,
    agent.business_description,
  ]
    .filter(Boolean)
    .join(' ');
  return PROFILES.find((profile) => profile.test.test(hay)) || PROFILES[PROFILES.length - 1];
}

/* --------------------------------------------------------- Classification ---- */

function classifyStep(step, tools) {
  const value = String(step || '');
  const tool = tools.find((item) => value.toLowerCase().includes(item.toLowerCase()));
  if (tool) return { kind: 'integration', tool };
  if (/(approv|sign.?off|human review|manager review|professional review)/i.test(value))
    return { kind: 'approval' };
  if (/(send|publish|update the|update calendar|create the|upload|notify|schedule|file the|post )/i.test(value))
    return { kind: 'action' };
  if (/(extract|retrieve|collect|gather)/i.test(value)) return { kind: 'data_collection' };
  if (/(analys|analyze|compare|calculat|validat|assess|evaluat|identif|check|qualif|verify|score|research)/i.test(value))
    return { kind: 'analysis' };
  return { kind: 'ai_processing' };
}

/* ------------------------------------------------------------- Builder ---- */

export function buildWorkflowGraph(input = {}) {
  const agent = {
    name: text(input.name, 120) || 'the agent',
    specialization: text(input.specialization || input.agent_title || input.role, 160),
    industry: text(input.industry, 120),
    business_name: text(input.business_name, 120),
    business_description: text(input.business_description, 600),
    tone: text(input.tone, 80) || 'professional and concise',
    tools: listOf(input.tools, 3),
    permissions: listOf(input.permissions, 8),
    knowledge: listOf(input.knowledge_requirements, 5),
    safety: listOf(input.safety_rules, 5),
    workflow: listOf(input.workflow, 7, 180),
    goals: listOf(input.goals, 4),
  };

  const profile = profileFor(agent);
  const steps = (agent.workflow.length ? agent.workflow : profile.steps).slice(0, 7);
  const usedTools = new Set();
  const nodes = [];

  const push = (node) => {
    const id = `n${nodes.length + 1}`;
    nodes.push({
      id,
      inputs: [],
      outputs: [],
      editable: true,
      ...node,
    });
    return nodes[nodes.length - 1];
  };

  push({
    kind: 'start',
    title: `${agent.name} starts a run`,
    description: 'A run starts when the owner submits a task. The workflow version used is locked to the run.',
    instructions: 'Create the run record and lock the workflow version in use.',
    outputs: ['Run record'],
    editable: false,
  });

  push({
    kind: 'trigger',
    title: 'Task submitted by the owner',
    description: 'The task text and any attached files are the only trigger inputs.',
    instructions: 'Capture the owner request exactly as written, with no rewording.',
    outputs: ['Task instruction'],
    editable: false,
  });

  push({
    kind: 'input',
    title: `Receive the ${profile.inputNoun}`,
    description: 'Reads the task and every attachment, and signs the files so they can be read.',
    instructions: `Read the request and the attachments end to end. Apply the ${agent.tone} tone from here on.`,
    inputs: ['Task text', 'Attachments'],
    outputs: ['Normalised request'],
  });

  push({
    kind: 'data_collection',
    title: 'Collect business context',
    description: `Gathers what ${agent.business_name || 'the business'} already holds before any work is done.`,
    instructions: `Use only the business context and knowledge the owner supplied. Never assume a policy, price or record that is not in it.`,
    inputs: agent.knowledge.length ? agent.knowledge : ['Business description'],
    outputs: ['Working context'],
  });

  // The input node already receives the request, so a first step that only
  // repeats "receive the …" is not drawn twice.
  const drawingSteps = steps.filter(
    (step, index) => !(index === 0 && /^(receive|open|read|get|collect)\b/i.test(step))
  );

  drawingSteps.forEach((step, index) => {
    const { kind, tool } = classifyStep(step, agent.tools);
    if (tool) usedTools.add(tool);
    push({
      kind,
      title: step,
      description: `Step ${index + 1} of the ${profile.label} workflow for ${agent.business_name || 'the business'}.`,
      instructions: `${step} Return only this step's result. Stay inside the granted permissions: ${agent.permissions.join(', ') || 'none'}.`,
      outputs: [`Step ${index + 1} result`],
      ...(tool ? { tool } : {}),
      // Critical actions never run without a human click first.
      ...(kind === 'action' ? { requires_approval: true } : {}),
    });
  });

  agent.tools
    .filter((tool) => !usedTools.has(tool))
    .forEach((tool) => {
      push({
        kind: 'integration',
        tool,
        title: `Use ${tool}`,
        description: `${tool} is used for the steps that need it. Without a connected account this step needs a manual action.`,
        instructions: `Perform the ${tool} action the earlier steps prepared. Never invent what ${tool} returned.`,
        inputs: ['Prepared content'],
        outputs: [`${tool} response`],
      });
    });

  push({
    kind: 'decision',
    title: profile.decision,
    description: 'The agent checks its own work against the standard before anything leaves the run.',
    instructions: `Answer YES or NO. ${profile.decision} Base the answer only on evidence produced by the previous steps. If the evidence is incomplete the answer is NO.`,
    inputs: ['Step results'],
    outputs: ['YES/NO with reason'],
    branches: { yes: 'Owner approval, then the deliverable', no: 'Owner approval — the check failed' },
  });

  push({
    kind: 'approval',
    requires_approval: true,
    title: profile.approval,
    description: 'Every run stops here. Nothing after this node runs until the owner clicks approve.',
    instructions: 'Present the decision, its reason and the prepared work to the owner. Continue only when a human approves.',
    inputs: ['Decision and reason'],
    outputs: ['Approval or rejection'],
  });

  push({
    kind: 'output',
    title: profile.output,
    description: 'Assembles the deliverable the owner can use immediately.',
    instructions: `Assemble the final deliverable from the completed steps. Use short markdown sections ${agent.goals.length ? `that move the goals forward: ${agent.goals.join('; ')}. ` : ''}Never invent links, prices, names or numbers.`,
    inputs: ['Completed step results'],
    outputs: ['Final deliverable'],
  });

  push({
    kind: 'completion',
    title: 'Run complete',
    description: 'The result is saved with the step timings and returned to the owner.',
    instructions: 'Close the run, save the result and record the duration.',
    outputs: ['Saved result'],
    editable: false,
  });

  push({
    kind: 'error_handling',
    title: 'Handle failure',
    description: 'If a step fails the run stops, the failing step and message are saved, and nothing is retried silently.',
    instructions: 'Record the failing step, the exact error and the manual action the owner must take.',
    editable: false,
  });

  const decision = nodes.find((node) => node.kind === 'decision');
  // Fix (staging testing): an agent's own steps can classify as 'approval'. The decision must lead to the
  // checkpoint pushed AFTER it, or the deliverable and completion become unreachable and validation fails.
  const afterDecision = decision ? nodes.slice(nodes.indexOf(decision) + 1) : nodes;
  const approval = afterDecision.find((node) => node.kind === 'approval');
  const output = afterDecision.find((node) => node.kind === 'output');

  const edges = [];
  const mainline = nodes.filter((node) => node.kind !== 'error_handling');

  mainline.forEach((node, index) => {
    if (node.kind === 'completion') return;
    const next = mainline[index + 1];
    if (node.kind === 'decision') {
      // Both answers now pass through the human checkpoint before the deliverable.
      const yesTarget = approval || output;
      if (yesTarget && yesTarget.id !== node.id) {
        edges.push({ from: node.id, to: yesTarget.id, label: 'YES', condition: 'yes' });
      }
      if (approval && approval.id !== node.id) {
        edges.push({ from: node.id, to: approval.id, label: 'NO', condition: 'no' });
      }
      return;
    }
    if (next) edges.push({ from: node.id, to: next.id, label: '', condition: 'always' });
  });

  return {
    version: 1,
    source: 'generated',
    profile: profile.key,
    generated_at: new Date().toISOString(),
    nodes,
    edges,
  };
}

/* ------------------------------------------------------------ Validation ---- */

export function validateWorkflowGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== 'object') return { ok: false, errors: ['No workflow was supplied.'] };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  if (nodes.length < 3) errors.push('A workflow needs at least three nodes.');
  if (nodes.length > MAX_NODES) errors.push(`A workflow can hold at most ${MAX_NODES} nodes.`);
  if (!nodes.length || nodes[0].kind !== 'start') errors.push('The workflow must begin with a start node.');
  if (!nodes.some((node) => node.kind === 'completion')) errors.push('The workflow needs a completion node.');

  const ids = new Set();
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') {
      errors.push('Every node must be an object.');
      return;
    }
    if (!node.id) errors.push('Every node needs an id.');
    else if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}.`);
    ids.add(node.id);
    if (!NODE_KINDS.includes(node.kind)) errors.push(`Unknown node kind: ${String(node.kind)}.`);
    if (!text(node.title)) errors.push(`Node ${String(node.id)} needs a title.`);
  });

  edges.forEach((edge) => {
    if (!ids.has(edge?.from) || !ids.has(edge?.to)) errors.push('An arrow points at a node that does not exist.');
  });

  const reachable = new Set();
  const walk = (id) => {
    if (!id || reachable.has(id)) return;
    reachable.add(id);
    edges.filter((edge) => edge.from === id).forEach((edge) => walk(edge.to));
  };
  if (nodes[0]) walk(nodes[0].id);
  nodes
    .filter((node) => node.kind !== 'error_handling' && !reachable.has(node.id))
    .forEach((node) => errors.push(`"${node.title}" is not reachable from the start node.`));

  const decision = nodes.find((node) => node.kind === 'decision');
  if (decision) {
    const branches = edges.filter((edge) => edge.from === decision.id);
    if (!branches.some((edge) => edge.condition === 'yes'))
      errors.push('The decision node needs a YES path.');
    if (!branches.some((edge) => edge.condition === 'no'))
      errors.push('The decision node needs a NO path.');
  }

  return { ok: errors.length === 0, errors };
}

export function initialSteps(graph) {
  return (graph?.nodes || []).map((node) => ({
    node_id: node.id,
    title: node.title,
    kind: node.kind,
    status: RUN.PENDING,
    output: '',
    error: '',
    note: '',
    started_at: '',
    finished_at: '',
  }));
}