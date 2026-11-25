// Translates the Base44 entity API (list/filter/get/count/create/update/delete/
// aggregate) onto a supabase-js client, so existing code keeps calling
// `entities.Agent.filter({ status: { $in: [...] } }, { sort: '-created_date' })`.
//
// The SAME file is used by the browser (src/api/entityQuery.js) and by the server
// functions (supabase/functions/_shared/entityQuery.js). Keep them identical:
// scripts/check-shared.mjs fails the build if they drift.

export const TABLES = {
  Agent: 'agents',
  AgentTask: 'agent_tasks',
  AgentUpload: 'agent_uploads',
  AuditLog: 'audit_logs',
  Inquiry: 'inquiries',
  Organization: 'organizations',
  OrganizationMember: 'organization_members',
  ResearchReport: 'research_reports',
  UsageRecord: 'usage_records',
  User: 'profiles',
};

const ARRAY_COLUMNS = {
  agents: ['responsibilities', 'permissions', 'tools', 'goals', 'workflow', 'knowledge_requirements', 'safety_rules'],
  agent_tasks: ['warnings', 'attachments', 'attachment_names'],
  research_reports: ['suppliers', 'limitations'],
  profiles: ['organization_ids'],
};

// uuid columns, and text columns that reference another table: Base44 stored ''
// for "none", Postgres needs NULL.
const NULLABLE_REFS = {
  '*': ['created_by_id'],
  organization_members: ['user_id', 'organization_id'],
  usage_records: ['user_id'],
  audit_logs: ['actor_id'],
  agents: ['organization_id'],
  agent_tasks: ['organization_id'],
  agent_uploads: ['organization_id'],
  research_reports: ['organization_id'],
};

const UUID_COLUMNS = {
  '*': ['created_by_id'],
  organization_members: ['user_id'],
  usage_records: ['user_id'],
  audit_logs: ['actor_id'],
  profiles: ['id'],
};

const isArrayColumn = (table, column) => (ARRAY_COLUMNS[table] || []).includes(column);
const isUuidColumn = (table, column) =>
  UUID_COLUMNS['*'].includes(column) || (UUID_COLUMNS[table] || []).includes(column);
const isNullableRef = (table, column) =>
  NULLABLE_REFS['*'].includes(column) || (NULLABLE_REFS[table] || []).includes(column);

export const tableFor = (entityName) => {
  const table = TABLES[entityName];
  if (!table) throw Object.assign(new Error(`Unknown entity ${entityName}`), { status: 400 });
  return table;
};

// ---------------------------------------------------------------------------
// Filter translation → PostgREST logic tree (applied with .or('and(...)'))
// ---------------------------------------------------------------------------
const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const literal = (value) => (value instanceof Date ? value.toISOString() : value);
const NONE = '__no_match__';

function scalarCondition(table, column, value) {
  const v = literal(value);
  if (v === null || v === undefined) return `${column}.is.null`;
  if (typeof v === 'boolean') return `${column}.is.${v}`;
  if (v === '' && isUuidColumn(table, column)) return `${column}.is.null`;
  if (isArrayColumn(table, column) && !Array.isArray(v)) return `${column}.cs.{${quote(v)}}`;
  return `${column}.eq.${quote(v)}`;
}

function listLiteral(values) {
  return `(${values.map((x) => quote(literal(x))).join(',')})`;
}

function columnConditions(table, column, condition) {
  if (condition === null || typeof condition !== 'object' || Array.isArray(condition) || condition instanceof Date) {
    return [scalarCondition(table, column, condition)];
  }
  const parts = [];
  for (const [op, raw] of Object.entries(condition)) {
    const value = literal(raw);
    switch (op) {
      case '$in': {
        const list = Array.isArray(value) ? value.filter((x) => x !== undefined) : [value];
        if (!list.length) parts.push(`id.eq.${quote(NONE)}`);
        else if (isArrayColumn(table, column)) parts.push(`${column}.ov.{${list.map(quote).join(',')}}`);
        else parts.push(`${column}.in.${listLiteral(list)}`);
        break;
      }
      case '$nin': {
        const list = Array.isArray(value) ? value : [value];
        if (list.length) parts.push(`${column}.not.in.${listLiteral(list)}`);
        break;
      }
      case '$ne':
        parts.push(value === null || value === undefined ? `${column}.not.is.null` : `${column}.neq.${quote(value)}`);
        break;
      case '$gt': parts.push(`${column}.gt.${quote(value)}`); break;
      case '$gte': parts.push(`${column}.gte.${quote(value)}`); break;
      case '$lt': parts.push(`${column}.lt.${quote(value)}`); break;
      case '$lte': parts.push(`${column}.lte.${quote(value)}`); break;
      case '$exists': parts.push(value ? `${column}.not.is.null` : `${column}.is.null`); break;
      case '$regex': {
        const text = String(value).replace(/[*%_\\]/g, ' ').trim();
        const caseless = String(condition.$options || '').includes('i');
        parts.push(`${column}.${caseless ? 'ilike' : 'like'}.${quote(`*${text}*`)}`);
        break;
      }
      case '$options':
        break;
      default:
        throw Object.assign(new Error(`Unsupported query operator ${op}`), { status: 400 });
    }
  }
  return parts;
}

export function toLogic(table, query) {
  const parts = [];
  for (const [key, condition] of Object.entries(query || {})) {
    if (condition === undefined) continue;
    if (key === '$or' || key === '$and') {
      const branches = (Array.isArray(condition) ? condition : [])
        .map((branch) => toLogic(table, branch))
        .filter((branch) => branch.length)
        .map((branch) => (branch.length === 1 ? branch[0] : `and(${branch.join(',')})`));
      if (branches.length) parts.push(`${key === '$or' ? 'or' : 'and'}(${branches.join(',')})`);
      continue;
    }
    parts.push(...columnConditions(table, key.replace(/^data\./, ''), condition));
  }
  return parts;
}

export function applyQuery(builder, table, query) {
  const parts = toLogic(table, query);
  if (!parts.length) return builder;
  return builder.or(`and(${parts.join(',')})`);
}

export function applySort(builder, sort) {
  if (typeof sort !== 'string' || !sort.trim()) return builder;
  let next = builder;
  for (const piece of sort.split(',')) {
    const key = piece.trim();
    if (!key) continue;
    const desc = key.startsWith('-');
    next = next.order(key.replace(/^[-+]/, ''), { ascending: !desc, nullsFirst: false });
  }
  return next;
}

// Base44 wrote '' for "no reference"; foreign keys and uuid columns need NULL.
// BEGIN GENERATED COLUMNS (scripts/gen-columns.mjs — do not edit by hand)
export const COLUMNS = {
  profiles: new Set(["id","email","full_name","role","organization_ids","created_date","updated_date"]),
  organizations: new Set(["id","name","slug","industry","size","plan","status","internal","data_class","stripe_customer_id","stripe_subscription_id","task_limit_month","agent_limit","seat_limit","concurrent_limit","created_date","updated_date","created_by_id","created_by","agent_subscription_id"]),
  organization_members: new Set(["id","organization_id","user_id","email","full_name","member_role","status","joined_at","created_date","updated_date","created_by_id","created_by"]),
  agents: new Set(["id","name","organization_id","specialization","industry_key","industry","business_name","business_description","tasks","responsibilities","permissions","tone","tools","role","summary","goals","workflow","workflow_graph","workflow_version","workflow_enabled","knowledge_requirements","safety_rules","system_instructions","last_run_status","last_run_at","status","created_date","updated_date","created_by_id","created_by","catalog_key"]),
  agent_tasks: new Set(["id","execution_id","idempotency_key","agent_id","agent_name","organization_id","task","output","status","error","steps","approvals","progress","current_node","awaiting_approval","workflow_version","warnings","attachments","attachment_names","duration_ms","started_at","finished_at","created_date","updated_date","created_by_id","created_by"]),
  agent_uploads: new Set(["id","file_uri","file_name","organization_id","created_date","updated_date","created_by_id","created_by"]),
  research_reports: new Set(["id","query","organization_id","market","suppliers","assumptions","products","product_count","overall_confidence","sources","limitations","summary","researched_at","agent_id","xlsx_file_uri","xlsx_generated_at","created_date","updated_date","created_by_id","created_by"]),
  usage_records: new Set(["id","organization_id","user_id","agent_id","task_id","kind","units","model","input_tokens","output_tokens","duration_ms","created_date","updated_date","created_by_id","created_by"]),
  audit_logs: new Set(["id","organization_id","actor_id","actor_email","action","target_type","target_id","detail","created_date","updated_date","created_by_id","created_by"]),
  inquiries: new Set(["id","name","email","service","message","status","reference","submitted_at","studio_notified_at","studio_notify_status","visitor_ack_status","visitor_ack_at","created_date","updated_date","created_by_id","created_by"]),
  ai_usage: new Set(["id","user_id","organization_id","function_name","model","input_tokens","output_tokens","web_searches","cost_usd","ok","created_date","error"]),
  recruitment_campaigns: new Set(["id","organization_id","title","specialization","country","city","positions_required","skills","experience_min","experience_max","certifications","languages","work_mode","schedule","availability","duration","description","currency","pay_frequency","initial_offer","max_budget","negotiation_strategy","max_rounds","outreach_mode","auto_contact_min_score","status","retention_days","apply_slug","closed_at","created_date","updated_date","created_by_id","created_by"]),
  recruitment_candidates: new Set(["id","organization_id","campaign_id","full_name","headline","country","city","specialization","experience_years","skills","certifications","languages","profile_text","portfolio_url","cv_path","source","source_detail","lawful_basis","contact_enc","contact_hint","expected_comp","final_comp","availability","status","score","score_explanation","evaluated_at","do_not_contact","portal_token_hash","portal_expires_at","last_contacted_at","responded_at","hired_at","erased_at","created_date","updated_date","created_by_id","created_by"]),
  recruitment_messages: new Set(["id","organization_id","campaign_id","candidate_id","direction","channel","kind","subject","body","status","attempts","error","sent_at","created_date","updated_date","created_by_id","created_by"]),
  recruitment_offers: new Set(["id","organization_id","campaign_id","candidate_id","round","party","amount","currency","pay_frequency","outcome","note","created_date","updated_date","created_by_id","created_by"]),
  recruitment_consents: new Set(["id","organization_id","candidate_id","kind","granted","text_version","source","ip_hash","recorded_at","created_date","updated_date","created_by_id","created_by"]),
  recruitment_events: new Set(["id","organization_id","campaign_id","candidate_id","kind","level","detail","created_date","updated_date","created_by_id","created_by"]),
  recruitment_interview_plans: new Set(["id","organization_id","campaign_id","questions","max_followups","valid_days","status","approved_at","approved_by","created_date","updated_date","created_by_id","created_by"]),
  recruitment_interviews: new Set(["id","organization_id","campaign_id","candidate_id","questions","max_followups","status","current_index","followups_used","expires_at","started_at","completed_at","evaluation","score","evaluated_at","report_sent_at","created_date","updated_date","created_by_id","created_by"]),
  recruitment_interview_messages: new Set(["id","organization_id","interview_id","role","kind","question_index","content","created_date","updated_date","created_by_id","created_by"]),
  security_pairing_codes: new Set(["id","organization_id","code_hash","expires_at","used_at","device_id","created_date","updated_date","created_by_id","created_by"]),
  security_devices: new Set(["id","organization_id","name","platform","app_version","public_key","status","paired_at","last_seen_at","revoked_at","revoked_by","created_date","updated_date","created_by_id","created_by"]),
  security_scans: new Set(["id","organization_id","device_id","nonce","signed_at","payload_sha256","schema_version","scanner_version","started_at","finished_at","networks_enc","network_summary","authorized_by","authorization_statement","host_count","open_port_count","status","created_date","updated_date","created_by_id","created_by"]),
  security_scan_hosts: new Set(["id","organization_id","scan_id","identity_enc","ip_sort","vendor","device_type","os_guess","ports","created_date","updated_date","created_by_id","created_by"]),
  agent_plans: new Set(["key","name","price_cents","currency","meters","unit_label","trial","cost_cap_usd","trial_cost_cap_usd","featured","sort","active","created_date","updated_date"]),
  agent_hires: new Set(["id","organization_id","subject","agent_id","plan_key","status","stripe_subscription_id","stripe_item_id","current_period_start","current_period_end","ends_at","past_due_since","created_date","updated_date","created_by_id","created_by"]),
  agent_usage: new Set(["id","organization_id","subject","plan_key","kind","period_start","period_end","used","ai_cost_usd","warned","created_date","updated_date","created_by_id","created_by"]),
  stripe_events: new Set(["id","type","result","created_date","updated_date","created_by_id","created_by"]),
};
// END GENERATED COLUMNS

// Base44 entities were schemaless and ignored unknown fields; Postgres rejects the
// whole write. Keep Base44's behaviour: drop fields that are not real columns.
// Identity and timestamp columns are enforced by database triggers for signed-in
// callers (tg_stamp_insert / tg_stamp_update), whatever the payload says.

export function cleanRecord(table, data) {
  const out = {};
  const known = COLUMNS[table];
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
    if (known && !known.has(key)) continue;
    if (value === '' && isNullableRef(table, key)) out[key] = null;
    else out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

const fail = (error, fallback = 'The request failed.') => {
  if (!error) return null;
  const status =
    error.code === 'PGRST116' ? 404 : error.code === '42501' ? 403 : error.code === '23505' ? 409 : Number(error.status) || 400;
  return Object.assign(new Error(error.message || fallback), { status, code: error.code, details: error.details });
};

const MAX_PAGE = 1000;

// Builds the Base44-shaped entity object for one table on one supabase-js client.
/** @param {any} client @param {string} entityName @returns {any} */
export function makeEntity(client, entityName) {
  const table = tableFor(entityName);

  async function fetchPage(query, options = {}) {
    const limit = Math.min(Number(options.limit) > 0 ? Number(options.limit) : 50, MAX_PAGE);
    const offset = Number.parseInt(options.cursor ?? options.skip ?? 0, 10) || 0;
    let builder = client.from(table).select('*', { count: 'exact' });
    builder = applyQuery(builder, table, query);
    builder = applySort(builder, options.sort);
    builder = builder.range(offset, offset + limit - 1);
    const { data, error, count } = await builder;
    if (error) throw fail(error);
    const items = data || [];
    const total = count ?? items.length;
    const hasMore = offset + items.length < total;
    return { items, total, has_more: hasMore, next_cursor: hasMore ? String(offset + items.length) : null };
  }

  async function fetchAll(query, sort, cap = 10000) {
    const rows = [];
    let cursor = 0;
    while (rows.length < cap) {
      const page = await fetchPage(query, { sort, limit: MAX_PAGE, cursor });
      rows.push(...page.items);
      if (!page.has_more) break;
      cursor = Number(page.next_cursor);
    }
    return rows;
  }

  return {
    // list(sortString, limit) → array   |   list({ sort, limit, cursor }) → page
    async list(a, b) {
      if (a && typeof a === 'object') return fetchPage({}, a);
      if (b) return (await fetchPage({}, { sort: a, limit: b })).items;
      return fetchAll({}, a);
    },
    // filter(query, sortString, limit) → array   |   filter(query, { sort, limit, cursor }) → page
    async filter(query, s, l) {
      if (s && typeof s === 'object') return fetchPage(query, s);
      if (l) return (await fetchPage(query, { sort: s, limit: l })).items;
      return fetchAll(query, s);
    },
    async get(id) {
      const { data, error } = await client.from(table).select('*').eq('id', String(id)).maybeSingle();
      if (error) throw fail(error);
      if (!data) throw Object.assign(new Error(`${entityName} not found`), { status: 404 });
      return data;
    },
    async count(query) {
      let builder = client.from(table).select('id', { count: 'exact', head: true });
      builder = applyQuery(builder, table, query);
      const { count, error } = await builder;
      if (error) throw fail(error);
      return count || 0;
    },
    async create(data) {
      const { data: row, error } = await client.from(table).insert(cleanRecord(table, data)).select('*').single();
      if (error) throw fail(error);
      return row;
    },
    async bulkCreate(list) {
      const { data, error } = await client.from(table).insert((list || []).map((d) => cleanRecord(table, d))).select('*');
      if (error) throw fail(error);
      return data || [];
    },
    // bulkUpdate([{ id, ...changes }]) → updated rows (one request per row; ids must be visible to the caller)
    async bulkUpdate(list) {
      const rows = [];
      for (const { id, ...changes } of list || []) {
        if (id === undefined || id === null) continue;
        const { data: row, error } = await client
          .from(table)
          .update(cleanRecord(table, changes))
          .eq('id', String(id))
          .select('*')
          .maybeSingle();
        if (error) throw fail(error);
        if (row) rows.push(row);
      }
      return rows;
    },
    async update(id, data) {
      const { data: row, error } = await client
        .from(table)
        .update(cleanRecord(table, data))
        .eq('id', String(id))
        .select('*')
        .maybeSingle();
      if (error) throw fail(error);
      if (!row) throw Object.assign(new Error(`${entityName} not found or not permitted`), { status: 404 });
      return row;
    },
    async delete(id) {
      const { data, error } = await client.from(table).delete().eq('id', String(id)).select('id');
      if (error) throw fail(error);
      if (!data?.length) throw Object.assign(new Error(`${entityName} not found or not permitted`), { status: 404 });
      return { id };
    },
    // aggregate({ query, groupBy, sum: ['units'], dateBucket: { field, unit: 'month' } }) → { rows }
    async aggregate({ query, groupBy, sum = [], avg = [], dateBucket } = {}) {
      const rows = await fetchAll(query);
      const groups = new Map();
      for (const row of rows) {
        let key = groupBy ? row[groupBy] ?? null : 'all';
        if (dateBucket) {
          const date = new Date(row[dateBucket.field]);
          if (Number.isNaN(date.getTime())) continue;
          key = new Date(
            Date.UTC(date.getUTCFullYear(), dateBucket.unit === 'year' ? 0 : date.getUTCMonth(), 1)
          ).toISOString();
        }
        const group = groups.get(key) || { count: 0 };
        group.count += 1;
        for (const field of sum) group[`sum_${field}`] = (group[`sum_${field}`] || 0) + (Number(row[field]) || 0);
        for (const field of avg) {
          const value = Number(row[field]);
          if (row[field] === null || row[field] === undefined || Number.isNaN(value)) continue;
          group[`_avgsum_${field}`] = (group[`_avgsum_${field}`] || 0) + value;
          group[`_avgn_${field}`] = (group[`_avgn_${field}`] || 0) + 1;
        }
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        for (const field of avg) {
          const n = group[`_avgn_${field}`] || 0;
          group[`avg_${field}`] = n ? group[`_avgsum_${field}`] / n : null;
          delete group[`_avgsum_${field}`];
          delete group[`_avgn_${field}`];
        }
      }
      return {
        rows: [...groups].map(([key, group]) => ({
          ...(groupBy ? { [groupBy]: key } : {}),
          ...(dateBucket ? { [dateBucket.field]: key } : {}),
          ...group,
        })),
      };
    },
  };
}

/** @param {any} client @returns {any} */
export function makeEntities(client) {
  const cache = {};
  return new Proxy(
    {},
    {
      get(_, name) {
        if (typeof name !== 'string' || name === 'then') return undefined;
        cache[name] ||= makeEntity(client, name);
        return cache[name];
      },
    }
  );
}
