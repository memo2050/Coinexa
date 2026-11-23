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
export function cleanRecord(table, data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue;
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
    async aggregate({ query, groupBy, sum = [], dateBucket } = {}) {
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
        groups.set(key, group);
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
