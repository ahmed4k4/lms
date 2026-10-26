'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { audit } from '@/lib/audit';
import {
  categorySchema, createInstructorSchema, grantSchema, parseForm, rejectSchema, roleChangeSchema, settingsSchema, type ActionState,
} from '@/lib/validation';
import { fail, ok } from './helpers';

async function roleId(admin: any, key: string) {
  const { data } = await admin.from('roles').select('id').eq('key', key).single();
  return data?.id as string;
}
async function targetRoles(admin: any, userId: string): Promise<string[]> {
  const { data } = await admin.from('user_roles').select('roles(key)').eq('user_id', userId);
  return (data ?? []).map((r: any) => (Array.isArray(r.roles) ? r.roles[0]?.key : r.roles?.key)).filter(Boolean);
}

export async function createInstructorAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, user } = await requirePermission('instructors.manage');
  const { t, locale } = await getT();
  const p = parseForm(createInstructorSchema, formData);
  if (!p.ok) return { error: t('err.invalid_input') };
  const password = randomBytes(12).toString('base64url'); // shown once to the admin, never stored
  const { data, error } = await admin.auth.admin.createUser({
    email: p.data.email, password, email_confirm: true, user_metadata: { full_name: p.data.fullName, locale },
  });
  if (error || !data.user) return { error: /registered|exists/i.test(error?.message ?? '') ? t('admin.email_taken') : t('err.generic') };
  const id = data.user.id;
  await admin.from('user_roles').insert({ user_id: id, role_id: await roleId(admin, 'instructor'), granted_by: user.id });
  await admin.from('instructor_profiles').insert({ user_id: id, status: 'active' });
  await audit({ actorId: user.id, action: 'instructor.created', entityType: 'user', entityId: id });
  revalidatePath('/admin/instructors');
  return { ok: true, message: t('admin.instructor_created'), data: { email: p.data.email, password } };
}

export async function setInstructorStatusAction(userId: string, status: 'active' | 'suspended'): Promise<void> {
  const { admin, user } = await requirePermission('instructors.manage');
  await admin.from('instructor_profiles').update({ status }).eq('user_id', userId);
  await audit({ actorId: user.id, action: `instructor.${status === 'active' ? 'activated' : 'suspended'}`, entityType: 'user', entityId: userId });
  revalidatePath('/admin/instructors');
}

export async function setAccountStatusAction(userId: string, suspend: boolean, formData?: FormData): Promise<void> {
  const { admin, user, roles } = await requirePermission('users.manage');
  if (userId === user.id) return;
  const target = await targetRoles(admin, userId);
  if (target.includes('super_admin') && !roles.includes('super_admin')) return;
  if (target.includes('admin') && !roles.includes('super_admin')) return;
  const reason = suspend ? String(formData?.get('reason') ?? '').slice(0, 300) || null : null;
  await admin.from('profiles').update({ status: suspend ? 'suspended' : 'active', suspended_reason: reason }).eq('id', userId);
  // Ban blocks new logins and token refresh; the DB status check blocks everything immediately.
  await admin.auth.admin.updateUserById(userId, { ban_duration: suspend ? '876000h' : 'none' });
  await audit({ actorId: user.id, action: suspend ? 'user.suspended' : 'user.activated', entityType: 'user', entityId: userId, metadata: { reason } });
  revalidatePath('/admin/users');
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const { admin, user } = await requirePermission('admins.manage');
  const p = parseForm(roleChangeSchema, formData);
  if (!p.ok || p.data.userId === user.id) return;
  const current = await targetRoles(admin, p.data.userId);
  if (current.includes('super_admin')) return; // super admins are managed out-of-band
  const drop = ['instructor', 'admin'];
  for (const key of drop) {
    if (key !== p.data.role) await admin.from('user_roles').delete().eq('user_id', p.data.userId).eq('role_id', await roleId(admin, key));
  }
  if (p.data.role !== 'student') {
    await admin.from('user_roles').upsert({ user_id: p.data.userId, role_id: await roleId(admin, p.data.role), granted_by: user.id }, { onConflict: 'user_id,role_id' });
    if (p.data.role === 'instructor') await admin.from('instructor_profiles').upsert({ user_id: p.data.userId, status: 'active' }, { onConflict: 'user_id', ignoreDuplicates: true });
  }
  await audit({ actorId: user.id, action: 'role.changed', entityType: 'user', entityId: p.data.userId, metadata: { from: current, to: p.data.role } });
  revalidatePath('/admin/users');
}

export async function reviewCourseAction(courseId: string, decision: 'approve' | 'reject' | 'suspend' | 'archive' | 'restore', _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, admin, user } = await requirePermission('courses.review'); // user-scoped client => RLS + status trigger apply
  const { t } = await getT();
  let reason: string | null = null;
  if (decision === 'reject' || decision === 'suspend') {
    const p = parseForm(rejectSchema, formData);
    if (!p.ok) return { error: t('admin.reason_required') };
    reason = p.data.reason;
  }
  const status = { approve: 'published', restore: 'published', reject: 'rejected', suspend: 'suspended', archive: 'archived' }[decision];
  const { data, error } = await supabase.from('courses').update({ status, rejection_reason: reason }).eq('id', courseId).select('id, title, created_by').maybeSingle();
  if (error || !data) return fail('err.forbidden');
  const type = { approve: 'course_approved', restore: 'course_approved', reject: 'course_rejected', suspend: 'course_suspended', archive: 'course_archived' }[decision];
  await admin.from('notifications').insert({ user_id: data.created_by, type, title: data.title, body: reason, link: `/instructor/courses/${courseId}` });
  await audit({ actorId: user.id, action: `course.${decision}`, entityType: 'course', entityId: courseId, metadata: { reason } });
  revalidatePath('/admin/courses');
  return ok('msg.saved');
}

export async function grantAccessAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, user } = await requirePermission('entitlements.grant');
  const { t } = await getT();
  const p = parseForm(grantSchema, formData);
  if (!p.ok) return { error: t('err.invalid_input') };
  const { data: uid } = await admin.rpc('find_user_id_by_email', { p_email: p.data.email });
  if (!uid) return { error: t('admin.user_not_found') };
  const { data: course } = await admin.from('courses').select('id, title, status').eq('id', p.data.courseId).maybeSingle();
  if (!course || !['published', 'archived'].includes(course.status)) return { error: t('admin.course_not_published') };
  const expires = p.data.days ? new Date(Date.now() + p.data.days * 86_400_000).toISOString() : null;
  const { data: ent, error } = await admin.from('entitlements')
    .insert({ user_id: uid, course_id: course.id, source: 'admin_grant', granted_by: user.id, expires_at: expires, note: p.data.note ?? null })
    .select('id').single();
  if (error || !ent) return { error: t('err.generic') };
  await admin.from('enrollments').upsert({ user_id: uid, course_id: course.id }, { onConflict: 'user_id,course_id', ignoreDuplicates: true });
  await admin.from('notifications').insert({ user_id: uid, type: 'access_granted', title: course.title, link: '/dashboard' });
  await audit({ actorId: user.id, action: 'entitlement.granted', entityType: 'entitlement', entityId: ent.id, metadata: { userId: uid, courseId: course.id, expires } });
  revalidatePath('/admin/entitlements');
  return ok('msg.saved');
}

export async function revokeEntitlementAction(entitlementId: string): Promise<void> {
  const { admin, user } = await requirePermission('entitlements.manage');
  const { data } = await admin.from('entitlements')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'admin', revoked_by: user.id })
    .eq('id', entitlementId).eq('status', 'active').select('user_id, course_id').maybeSingle();
  if (data) {
    // Also end any live playback sessions so the next playback-token request is re-checked immediately.
    await admin.from('playback_sessions').delete().eq('user_id', data.user_id);
    await audit({ actorId: user.id, action: 'entitlement.revoked', entityType: 'entitlement', entityId: entitlementId, metadata: { userId: data.user_id, courseId: data.course_id } });
  }
  revalidatePath('/admin/entitlements');
}

export async function saveCategoryAction(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requirePermission('categories.manage');
  const p = parseForm(categorySchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const row = { slug: p.data.slug, name_en: p.data.nameEn, name_ar: p.data.nameAr };
  const { error } = id ? await supabase.from('categories').update(row).eq('id', id) : await supabase.from('categories').insert(row);
  if (error) return fail('err.generic');
  await audit({ actorId: user.id, action: id ? 'category.updated' : 'category.created', entityType: 'category', entityId: id ?? p.data.slug });
  revalidatePath('/admin/categories');
  return ok('msg.saved');
}

export async function deleteCategoryAction(id: string): Promise<void> {
  const { supabase, user } = await requirePermission('categories.manage');
  await supabase.from('categories').delete().eq('id', id);
  await audit({ actorId: user.id, action: 'category.deleted', entityType: 'category', entityId: id });
  revalidatePath('/admin/categories');
}

export async function hideReviewAction(reviewId: string, hide: boolean): Promise<void> {
  const { admin, user } = await requirePermission('moderation.manage');
  await admin.from('reviews').update({ is_hidden: hide }).eq('id', reviewId);
  await audit({ actorId: user.id, action: hide ? 'review.hidden' : 'review.restored', entityType: 'review', entityId: reviewId });
  revalidatePath('/admin/reviews');
}

export async function saveSettingsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, user } = await requirePermission('settings.manage');
  const p = parseForm(settingsSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const rows = Object.entries(p.data).map(([key, value]) => ({ key, value, updated_by: user.id, updated_at: new Date().toISOString() }));
  const { error } = await admin.from('platform_settings').upsert(rows, { onConflict: 'key' });
  if (error) return fail('err.generic');
  await audit({ actorId: user.id, action: 'settings.updated', metadata: p.data });
  revalidatePath('/admin/settings');
  return ok('msg.saved');
}

/** Edits what the generic `admin` role may do. Only super admins hold admins.manage; that permission can never be delegated. */
export async function savePermissionsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, user } = await requirePermission('admins.manage');
  const { data: role } = await admin.from('roles').select('id').eq('key', 'admin').single();
  const { data: all } = await admin.from('permissions').select('key');
  if (!role || !all) return fail('err.generic');
  const wanted = new Set(formData.getAll('perm').map(String).filter((k) => k !== 'admins.manage' && all.some((p) => p.key === k)));
  const { data: current } = await admin.from('role_permissions').select('permission_key').eq('role_id', role.id);
  const have = new Set((current ?? []).map((c) => c.permission_key));
  const add = [...wanted].filter((k) => !have.has(k));
  const drop = [...have].filter((k) => !wanted.has(k));
  if (add.length) await admin.from('role_permissions').insert(add.map((k) => ({ role_id: role.id, permission_key: k })));
  if (drop.length) await admin.from('role_permissions').delete().eq('role_id', role.id).in('permission_key', drop);
  await audit({ actorId: user.id, action: 'role.permissions_changed', entityType: 'role', entityId: role.id, metadata: { added: add, removed: drop } });
  revalidatePath('/admin/roles');
  return ok('msg.saved');
}
