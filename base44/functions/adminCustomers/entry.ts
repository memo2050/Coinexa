import { adminContext, adminFailure } from '../../shared/adminGuard.ts';
import { dataClassOf, settledList, settledRows } from '../../shared/adminData.ts';

// Customer and workspace administration, read-only in Phase 1. Accounts are
// grouped by the class of the workspace they belong to so production customers
// are never mixed with the internal and test estate.
export default async function (req) {
  const ctx = await adminContext(req);
  if (ctx.response) return ctx.response;

  try {
    const { service } = ctx;

    const settled = await Promise.allSettled([
      service.entities.User.list(),
      service.entities.Organization.list(),
      service.entities.OrganizationMember.list(),
      service.entities.Agent.aggregate({ query: {}, groupBy: 'organization_id' }),
      service.entities.AgentTask.aggregate({ query: {}, groupBy: 'organization_id' }),
      service.entities.UsageRecord.aggregate({ query: {}, groupBy: 'organization_id', sum: ['units'] }),
    ]);

    const users = settledList(settled[0]);
    const organizations = settledList(settled[1]);
    const memberships = settledList(settled[2]);

    const orgById = new Map(organizations.map((org) => [org.id, org]));

    const countByOrg = (settledIndex) => {
      const map = new Map();
      for (const row of settledRows(settled[settledIndex])) {
        if (row.organization_id) map.set(row.organization_id, Number(row.count) || 0);
      }
      return map;
    };
    const agentCounts = countByOrg(3);
    const runCounts = countByOrg(4);
    const usageByOrg = new Map(
      settledRows(settled[5]).map((row) => [row.organization_id, Number(row.sum_units) || 0])
    );

    const membersByOrg = new Map();
    for (const member of memberships) {
      if (!membersByOrg.has(member.organization_id)) membersByOrg.set(member.organization_id, []);
      membersByOrg.get(member.organization_id).push({
        id: member.id,
        email: member.email || '',
        full_name: member.full_name || '',
        member_role: member.member_role || 'member',
        status: member.status || 'invited',
        joined_at: member.joined_at || member.created_date || null,
      });
    }

    const workspaces = organizations.map((org) => ({
      id: org.id,
      name: org.name || 'Untitled workspace',
      slug: org.slug || '',
      industry: org.industry || '',
      plan: org.plan || 'starter',
      status: org.status || 'active',
      dataClass: dataClassOf(org),
      internal: org.internal === true,
      created_date: org.created_date || null,
      limits: {
        agents: Number(org.agent_limit) || 0,
        runsPerMonth: Number(org.task_limit_month) || 0,
        seats: Number(org.seat_limit) || 0,
      },
      counts: {
        agents: agentCounts.get(org.id) || 0,
        runs: runCounts.get(org.id) || 0,
        units: usageByOrg.get(org.id) || 0,
        members: (membersByOrg.get(org.id) || []).filter((m) => m.status === 'active').length,
      },
      members: membersByOrg.get(org.id) || [],
      billing: {
        subscription: org.stripe_subscription_id ? 'connected' : null,
        customer: org.stripe_customer_id ? 'connected' : null,
      },
    }));

    const accounts = users.map((account) => {
      const workspaceIds = account.organization_ids || [];
      const classes = workspaceIds.map((id) => dataClassOf(orgById.get(id)));
      const dataClass = classes.includes('customer')
        ? 'customer'
        : classes.includes('internal')
          ? 'internal'
          : 'test';

      return {
        id: account.id,
        email: account.email || '',
        full_name: account.full_name || '',
        role: account.role || 'user',
        verified: account.is_verified === true,
        created_date: account.created_date || null,
        last_active: account.updated_date || null,
        dataClass,
        workspaces: workspaceIds
          .map((id) => orgById.get(id))
          .filter(Boolean)
          .map((org) => ({
            id: org.id,
            name: org.name || 'Untitled workspace',
            member_role:
              (membersByOrg.get(org.id) || []).find(
                (member) => member.email === account.email
              )?.member_role || 'member',
            dataClass: dataClassOf(org),
          })),
      };
    });

    const summary = {
      customer: { workspaces: 0, accounts: 0 },
      internal: { workspaces: 0, accounts: 0 },
      test: { workspaces: 0, accounts: 0 },
    };
    for (const workspace of workspaces) summary[workspace.dataClass].workspaces += 1;
    for (const account of accounts) summary[account.dataClass].accounts += 1;

    return Response.json({
      generatedAt: new Date().toISOString(),
      summary,
      productionCustomers: summary.customer.accounts,
      note:
        summary.customer.workspaces === 0
          ? 'No workspace is marked as a production customer yet. Accounts below belong to the internal or test estate.'
          : null,
      accounts: accounts.sort((a, b) => (a.created_date < b.created_date ? 1 : -1)),
      workspaces: workspaces.sort((a, b) => b.counts.runs - a.counts.runs),
    });
  } catch (error) {
    return adminFailure('adminCustomers', error, 'Customer records could not be loaded.');
  }
}