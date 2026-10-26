'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireInstructor } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import {
  announcementSchema, assignmentSchema, courseSchema, gradeSchema, lessonCreateSchema, lessonUpdateSchema, parseForm,
  pricingSchema, questionSchema, quizSchema, sectionSchema, type ActionState,
} from '@/lib/validation';
import { slugify } from '@/lib/utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteLessonMedia } from '@/lib/media';
import { deleteObject } from '@/lib/r2';
import { audit } from '@/lib/audit';
import { fail, ok } from './helpers';

// NOTE: every write below uses the *user-scoped* client, so Row Level Security is the final authority
// on ownership. Server-side checks here only improve error messages and workflow rules.

export async function createCourseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireInstructor();
  const { t } = await getT();
  const p = parseForm(courseSchema, formData);
  if (!p.ok) return { error: t('err.invalid_input') };
  const { data, error } = await supabase
    .from('courses')
    .insert({
      slug: slugify(p.data.title), title: p.data.title, subtitle: p.data.subtitle ?? null, description: p.data.description,
      category_id: p.data.categoryId ?? null, language: p.data.language, level: p.data.level, created_by: user.id,
      outcomes: p.data.outcomes, requirements: p.data.requirements, audience: p.data.audience,
    })
    .select('id')
    .single();
  if (error || !data) return { error: t('err.forbidden') };
  redirect(`/instructor/courses/${data.id}`);
}

export async function updateCourseAction(courseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const { t } = await getT();
  const p = parseForm(courseSchema, formData);
  if (!p.ok) return { error: t('err.invalid_input') };
  const { data, error } = await supabase
    .from('courses')
    .update({ title: p.data.title, subtitle: p.data.subtitle ?? null, description: p.data.description, category_id: p.data.categoryId ?? null, language: p.data.language, level: p.data.level, outcomes: p.data.outcomes, requirements: p.data.requirements, audience: p.data.audience })
    .eq('id', courseId)
    .select('id');
  if (error || !data?.length) return { error: t('err.forbidden') };
  revalidatePath(`/instructor/courses/${courseId}`);
  return ok('msg.saved');
}

/**
 * Pricing never edits history: a new plan row is created and the previous one deactivated.
 * Existing entitlements are untouched, so changing the model cannot silently revoke purchased access.
 */
export async function updatePricingAction(courseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const { t } = await getT();
  const p = parseForm(pricingSchema, formData);
  if (!p.ok) return { error: t('err.invalid_input') };
  const { data: course, error: cErr } = await supabase.from('courses').update({ access_type: p.data.accessType }).eq('id', courseId).select('id, title').maybeSingle();
  if (cErr || !course) return { error: t('err.forbidden') };

  let { data: product } = await supabase.from('products').select('id').eq('course_id', courseId).eq('type', 'course').maybeSingle();
  if (!product) {
    const { data: created, error } = await supabase.from('products').insert({ type: 'course', course_id: courseId, title: course.title }).select('id').single();
    if (error || !created) return { error: t('err.generic') };
    product = created;
  }
  await supabase.from('pricing_plans').update({ active: false }).eq('product_id', product.id).eq('active', true);
  const plan =
    p.data.accessType === 'free'
      ? { product_id: product.id, kind: 'free', amount_cents: 0, currency: p.data.currency }
      : { product_id: product.id, kind: 'one_time', amount_cents: Math.round((p.data.amount ?? 0) * 100), currency: p.data.currency, access_days: p.data.accessDays ?? null };
  const { error } = await supabase.from('pricing_plans').insert(plan);
  if (error) return { error: t('err.generic') };
  revalidatePath(`/instructor/courses/${courseId}`);
  return ok('msg.saved');
}

export async function submitForReviewAction(courseId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  const { count: lessons } = await supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
  if (!lessons) redirect(`/instructor/courses/${courseId}?error=empty`);
  await supabase.from('courses').update({ status: 'in_review' }).eq('id', courseId);
  revalidatePath(`/instructor/courses/${courseId}`);
}

export async function withdrawReviewAction(courseId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('courses').update({ status: 'draft' }).eq('id', courseId);
  revalidatePath(`/instructor/courses/${courseId}`);
}

export async function deleteCourseAction(courseId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  // Delete stored objects first (RLS only lets owners delete drafts).
  const { data: course } = await supabase.from('courses').select('id, status').eq('id', courseId).maybeSingle();
  if (!course || course.status !== 'draft') redirect('/instructor');
  const { data: lessons } = await supabase.from('lessons').select('id').eq('course_id', courseId);
  for (const l of lessons ?? []) await deleteLessonMedia(l.id);
  await supabase.from('courses').delete().eq('id', courseId);
  redirect('/instructor');
}

// ----- curriculum -----
async function nextPosition(supabase: any, table: string, col: string, value: string) {
  const { data } = await supabase.from(table).select('position').eq(col, value).order('position', { ascending: false }).limit(1);
  return (data?.[0]?.position ?? -1) + 1;
}

export async function addSectionAction(courseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const p = parseForm(sectionSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { error } = await supabase.from('sections').insert({ course_id: courseId, title: p.data.title, position: await nextPosition(supabase, 'sections', 'course_id', courseId) });
  if (error) return fail('err.forbidden');
  revalidatePath(`/instructor/courses/${courseId}`);
  return { ok: true };
}

export async function renameSectionAction(courseId: string, sectionId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireInstructor();
  const p = parseForm(sectionSchema, formData);
  if (p.ok) await supabase.from('sections').update({ title: p.data.title }).eq('id', sectionId).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}`);
}

export async function deleteSectionAction(courseId: string, sectionId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  const { data: lessons } = await supabase.from('lessons').select('id').eq('section_id', sectionId).eq('course_id', courseId);
  for (const l of lessons ?? []) await deleteLessonMedia(l.id);
  await supabase.from('sections').delete().eq('id', sectionId).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}`);
}

export async function addLessonAction(courseId: string, sectionId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const p = parseForm(lessonCreateSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { error } = await supabase.from('lessons').insert({ section_id: sectionId, title: p.data.title, type: p.data.type, position: await nextPosition(supabase, 'lessons', 'section_id', sectionId) });
  if (error) return fail('err.forbidden');
  revalidatePath(`/instructor/courses/${courseId}`);
  return { ok: true };
}

export async function moveAction(courseId: string, kind: 'section' | 'lesson', id: string, dir: 'up' | 'down'): Promise<void> {
  const { supabase } = await requireInstructor();
  const table = kind === 'section' ? 'sections' : 'lessons';
  const { data: me } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (!me) return;
  const parentCol = kind === 'section' ? 'course_id' : 'section_id';
  const { data: siblings } = await supabase.from(table).select('id, position').eq(parentCol, me[parentCol]).order('position').order('created_at');
  const list = siblings ?? [];
  const i = list.findIndex((s: any) => s.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  for (let idx = 0; idx < list.length; idx++) await supabase.from(table).update({ position: idx }).eq('id', list[idx].id);
  revalidatePath(`/instructor/courses/${courseId}`);
}

export async function updateLessonAction(courseId: string, lessonId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const p = parseForm(lessonUpdateSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { data, error } = await supabase
    .from('lessons')
    .update({ title: p.data.title, description: p.data.description ?? null, is_free_preview: p.data.isFreePreview })
    .eq('id', lessonId)
    .select('id, type')
    .maybeSingle();
  if (error || !data) return fail('err.forbidden');
  if (data.type === 'text') {
    const { error: e2 } = await supabase.from('lesson_contents').upsert({ lesson_id: lessonId, body: p.data.body ?? '' }, { onConflict: 'lesson_id' });
    if (e2) return fail('err.generic');
  }
  revalidatePath(`/instructor/courses/${courseId}`);
  return ok('msg.saved');
}

export async function deleteLessonAction(courseId: string, lessonId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  const { data } = await supabase.from('lessons').select('id').eq('id', lessonId).eq('course_id', courseId).maybeSingle();
  if (!data) return;
  await deleteLessonMedia(lessonId);
  await supabase.from('lessons').delete().eq('id', lessonId);
  redirect(`/instructor/courses/${courseId}`);
}

export async function deleteResourceAction(courseId: string, lessonId: string, resourceId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  const { data: ok } = await supabase.rpc('can_manage_course', { p_course_id: courseId });
  if (!ok) return;
  const admin = createAdminClient();
  const { data: r } = await admin.from('lesson_resources').select('object_key').eq('id', resourceId).eq('course_id', courseId).maybeSingle();
  if (r) {
    await deleteObject(r.object_key).catch(() => undefined);
    await admin.from('lesson_resources').delete().eq('id', resourceId);
  }
  revalidatePath(`/instructor/courses/${courseId}/lessons/${lessonId}`);
}

// ----- assessments -----
export async function createQuizAction(courseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const p = parseForm(quizSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { error } = await supabase.from('quizzes').insert({ course_id: courseId, title: p.data.title, pass_percent: p.data.passPercent });
  if (error) return fail('err.forbidden');
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
  return { ok: true };
}

export async function addQuestionAction(courseId: string, quizId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const p = parseForm(questionSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const opts = [p.data.option1, p.data.option2, p.data.option3, p.data.option4].filter(Boolean) as string[];
  const options = [p.data.option1, p.data.option2, p.data.option3, p.data.option4]
    .map((text, i) => (text ? { id: `o${i + 1}`, text } : null))
    .filter(Boolean);
  if (opts.length < 2) return fail('err.invalid_input');
  const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('quiz_id', quizId);
  const { data: q, error } = await supabase.from('questions').insert({ quiz_id: quizId, prompt: p.data.prompt, options, position: count ?? 0 }).select('id').single();
  if (error || !q) return fail('err.forbidden');
  const { error: kErr } = await supabase.from('question_keys').insert({ question_id: q.id, correct_option_id: `o${p.data.correct}`, explanation: p.data.explanation ?? null });
  if (kErr) {
    await supabase.from('questions').delete().eq('id', q.id);
    return fail('err.generic');
  }
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
  return { ok: true };
}

export async function toggleQuizPublishAction(courseId: string, quizId: string, publish: boolean): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('quizzes').update({ is_published: publish }).eq('id', quizId).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
}

export async function deleteQuizAction(courseId: string, quizId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('quizzes').delete().eq('id', quizId).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
}

export async function deleteQuestionAction(courseId: string, questionId: string): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('questions').delete().eq('id', questionId);
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
}

export async function createAssignmentAction(courseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireInstructor();
  const p = parseForm(assignmentSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { error } = await supabase.from('assignments').insert({ course_id: courseId, title: p.data.title, instructions: p.data.instructions, max_score: p.data.maxScore });
  if (error) return fail('err.forbidden');
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
  return { ok: true };
}

export async function toggleAssignmentPublishAction(courseId: string, id: string, publish: boolean): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('assignments').update({ is_published: publish }).eq('id', id).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
}

export async function deleteAssignmentAction(courseId: string, id: string): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('assignments').delete().eq('id', id).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
}

export async function gradeSubmissionAction(courseId: string, submissionId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireInstructor();
  const p = parseForm(gradeSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { error } = await supabase.rpc('grade_submission', { p_submission_id: submissionId, p_score: p.data.score, p_feedback: p.data.feedback ?? '' });
  if (error) return fail('err.forbidden');
  const admin = createAdminClient();
  const { data: s } = await admin.from('submissions').select('user_id, assignments(title)').eq('id', submissionId).maybeSingle();
  if (s) {
    const title = Array.isArray((s as any).assignments) ? (s as any).assignments[0]?.title : (s as any).assignments?.title;
    await admin.from('notifications').insert({ user_id: s.user_id, type: 'graded', title: title ?? 'Assignment', body: String(p.data.score), link: `/dashboard` });
  }
  await audit({ actorId: user.id, action: 'assignment.graded', entityType: 'submission', entityId: submissionId });
  revalidatePath(`/instructor/courses/${courseId}/assessments`);
  return ok('msg.saved');
}

/** An announcement is stored for the course (shown in the player) and pushed as a notification to enrolled students. */
export async function announceAction(courseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireInstructor();
  const p = parseForm(announcementSchema, formData);
  if (!p.ok) return fail('err.invalid_input');
  const { error } = await supabase.from('announcements').insert({ course_id: courseId, author_id: user.id, title: p.data.title, body: p.data.body });
  if (error) return fail('err.forbidden'); // RLS: only course managers
  const admin = createAdminClient();
  const { data: students } = await admin.from('enrollments').select('user_id').eq('course_id', courseId).limit(5000);
  const { data: course } = await admin.from('courses').select('slug').eq('id', courseId).single();
  const rows = (students ?? []).map((s) => ({ user_id: s.user_id, type: 'announcement', title: p.data.title, body: p.data.body.slice(0, 300), link: `/learn/${course?.slug}` }));
  if (rows.length) await admin.from('notifications').insert(rows);
  await audit({ actorId: user.id, action: 'course.announcement', entityType: 'course', entityId: courseId, metadata: { recipients: rows.length } });
  revalidatePath(`/instructor/courses/${courseId}/students`);
  return ok('msg.sent');
}

export async function deleteAnnouncementAction(courseId: string, id: string): Promise<void> {
  const { supabase } = await requireInstructor();
  await supabase.from('announcements').delete().eq('id', id).eq('course_id', courseId);
  revalidatePath(`/instructor/courses/${courseId}/students`);
}
