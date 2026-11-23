import { createClientFromRequest } from '../_shared/base44shim.ts';
import {
  ensureOrganization,
  membershipFor,
  canManage,
  planLimits,
  usageSummary,
  logAudit,
  syncUserMemberships,
} from '../_shared/tenancy.ts';
import { consumeActionQuota } from '../_shared/rateLimits.ts';

const clean = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error) => (error.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 40) || 'bootstrap';

    const { organization, membership } = await ensureOrganization({ base44, user });
    if (!organization) return Response.json({ error: 'No workspace is available.' }, { status: 500 });

    const service = base44.asServiceRole;
    const current = await membershipFor({ base44, user, organizationId: organization.id });
    const allowed = canManage(current);
    const limits = planLimits(organization.plan);
    const usage = await usageSummary({ base44, organization });

    if (action === 'bootstrap') {
      const members = await service.entities.OrganizationMember.filter(
        { organization_id: organization.id, status: { $in: ['active', 'invited'] } },
        { sort: 'created_date', limit: 50 }
      );
      return Response.json({
        organization: {
          id: organization.id,
          name: organization.name,
          plan: organization.plan,
          status: organization.status,
          task_limit_month: organization.task_limit_month || limits.tasks,
        },
        membership: { member_role: current?.member_role || membership.member_role, status: current?.status || membership.status },
        can_manage: allowed,
        usage,
        members: members.items.map((member) => ({
          id: member.id,
          email: member.email,
          full_name: member.full_name,
          member_role: member.member_role,
          status: member.status,
          joined_at: member.joined_at || member.created_date,
        })),
      });
    }

    if (!allowed) {
      return Response.json({ error: 'Only a workspace owner or admin can do that.' }, { status: 403 });
    }

    // Opening the workspace page (bootstrap) and reading activity are left
    // unmetered so normal browsing is never counted. Only changes are capped.
    if (action !== 'activity') {
      const quota = await consumeActionQuota({
        base44,
        user,
        kind: 'org_change',
        organizationId: organization.id,
      });
      if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });
    }

    if (action === 'invite') {
      const email = clean(body.email, 160).toLowerCase();
      const memberRole = body.member_role === 'admin' ? 'admin' : 'member';
      if (!isEmail(email)) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
      if (email === String(user.email || '').toLowerCase()) {
        return Response.json({ error: 'You are already a member of this workspace.' }, { status: 400 });
      }

      const seatLimit = Number(organization.seat_limit) > 0 ? Number(organization.seat_limit) : limits.seats;
      const existing = await service.entities.OrganizationMember.filter(
        { organization_id: organization.id, email, status: { $in: ['active', 'invited'] } },
        { limit: 1 }
      );
      if (existing.items.length) {
        return Response.json({ error: 'That address is already on the team.' }, { status: 400 });
      }
      if (usage.members >= seatLimit) {
        return Response.json(
          { error: `This workspace has used all ${seatLimit} seats on its plan.` },
          { status: 429 }
        );
      }

      const member = await service.entities.OrganizationMember.create({
        organization_id: organization.id,
        email,
        full_name: clean(body.full_name, 120),
        member_role: memberRole,
        status: 'invited',
      });
      await logAudit(base44, {
        organization_id: organization.id,
        user,
        action: 'member.invited',
        target_type: 'OrganizationMember',
        target_id: member.id,
        detail: `Invited ${email} as ${memberRole}`,
      });
      return Response.json({
        member: {
          id: member.id,
          email: member.email,
          member_role: member.member_role,
          status: member.status,
        },
        usage: await usageSummary({ base44, organization }),
      });
    }

    if (action === 'remove-member') {
      const membershipId = clean(body.membership_id, 80);
      if (!membershipId) return Response.json({ error: 'membership_id is required' }, { status: 400 });

      const target = await service.entities.OrganizationMember
        .get(membershipId)
        .catch((error) => (error.status === 404 ? null : Promise.reject(error)));
      if (!target || target.organization_id !== organization.id) {
        return Response.json({ error: 'That team member was not found.' }, { status: 404 });
      }
      if (target.user_id === user.id || target.member_role === 'owner') {
        return Response.json({ error: 'The workspace owner cannot be removed.' }, { status: 400 });
      }

      await service.entities.OrganizationMember.update(target.id, { status: 'removed' });

      // Gap A: membership is the tenant boundary, so the workspace has to leave
      // the removed member's organization_ids immediately. Without this the
      // access rules keep matching every record in the workspace they just left.
      const removedUser = target.user_id
        ? await service.entities.User.get(target.user_id).catch(() => null)
        : null;
      if (removedUser) {
        await syncUserMemberships({ base44, user: removedUser });
      }

      await logAudit(base44, {
        organization_id: organization.id,
        user,
        action: 'member.removed',
        target_type: 'OrganizationMember',
        target_id: target.id,
        detail: `Removed ${target.email}`,
      });
      return Response.json({ removed: target.id });
    }

    if (action === 'update') {
      const name = clean(body.name, 80);
      if (name.length < 2) return Response.json({ error: 'Enter a workspace name.' }, { status: 400 });

      const updated = await service.entities.Organization.update(organization.id, {
        name,
        industry: clean(body.industry, 80) || organization.industry || '',
        size: clean(body.size, 20) || organization.size || '',
      });
      await logAudit(base44, {
        organization_id: organization.id,
        user,
        action: 'organization.updated',
        target_type: 'Organization',
        target_id: organization.id,
        detail: `Renamed the workspace to ${name}`,
      });
      return Response.json({ organization: { id: updated.id, name: updated.name } });
    }

    if (action === 'activity') {
      const [logs, records] = await Promise.all([
        service.entities.AuditLog.filter(
          { organization_id: organization.id },
          { sort: '-created_date', limit: 40 }
        ),
        service.entities.UsageRecord.filter(
          { organization_id: organization.id },
          { sort: '-created_date', limit: 40 }
        ),
      ]);
      return Response.json({
        organization: { id: organization.id, name: organization.name, plan: organization.plan, status: organization.status },
        usage,
        activity: logs.items.map((entry) => ({
          id: entry.id,
          action: entry.action,
          detail: entry.detail,
          actor_email: entry.actor_email,
          target_type: entry.target_type,
          target_id: entry.target_id,
          at: entry.created_date,
        })),
        usage_records: records.items.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          units: entry.units,
          duration_ms: entry.duration_ms,
          agent_id: entry.agent_id,
          task_id: entry.task_id,
          at: entry.created_date,
        })),
      });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('manageOrganization failed', error);
    return Response.json({ error: 'The workspace request could not be completed.' }, { status: 500 });
  }
}