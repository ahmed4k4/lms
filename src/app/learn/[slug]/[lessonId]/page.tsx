import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { createAdminClient } from '@/lib/supabase/admin';
import { LessonPanel } from '@/components/lesson-panel';
import { Alert } from '@/components/ui/primitives';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  if (!z.string().uuid().safeParse(lessonId).success) notFound();
  const { supabase, user } = await requireUser(`/learn/${slug}/${lessonId}`);
  const { t } = await getT();

  const { data: course } = await supabase.from('courses').select('id, slug, title').eq('slug', slug).maybeSingle();
  if (!course) notFound();
  const { data: lesson } = await supabase.from('lessons').select('id, title, description, type, is_free_preview, course_id').eq('id', lessonId).eq('course_id', course.id).maybeSingle();
  if (!lesson) notFound();

  // The same Postgres function that guards playback decides here too.
  const { data: allowed } = await supabase.rpc('can_access_lesson', { p_lesson_id: lesson.id });
  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl">{lesson.title}</h1>
        <Alert tone="warn">{t('learn.locked')}</Alert>
        <Link href={`/courses/${slug}`} className={cn(buttonVariants())}>{t('learn.view_course')}</Link>
      </div>
    );
  }

  const [{ data: progress }, { data: content }, { data: resources }, { data: sections }, { data: notes }, { data: discussions }, { data: announcements }, mod] = await Promise.all([
    supabase.from('lesson_progress').select('position_seconds, completed').eq('user_id', user.id).eq('lesson_id', lesson.id).maybeSingle(),
    lesson.type === 'text' ? supabase.from('lesson_contents').select('body').eq('lesson_id', lesson.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('lesson_resources').select('id, title, size_bytes').eq('lesson_id', lesson.id).order('created_at'),
    supabase.from('sections').select('position, lessons(id, title, position)').eq('course_id', course.id).order('position'),
    supabase.from('lesson_notes').select('id, position_seconds, body').eq('lesson_id', lesson.id).order('position_seconds'),
    supabase.from('discussions').select('id, lesson_id, user_id, title, body, is_resolved, created_at').eq('course_id', course.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('announcements').select('id, title, body, created_at').eq('course_id', course.id).order('created_at', { ascending: false }).limit(20),
    supabase.rpc('can_manage_course', { p_course_id: course.id }),
  ]);
  const ids = (discussions ?? []).map((d) => d.id);
  const { data: replies } = ids.length
    ? await supabase.from('discussion_replies').select('id, discussion_id, user_id, body, created_at').in('discussion_id', ids).order('created_at').limit(300)
    : { data: [] };

  // Display names for people in this course's Q&A (first names only; the rows themselves were RLS-checked above).
  const authorIds = [...new Set([...(discussions ?? []).map((d) => d.user_id), ...(replies ?? []).map((r) => r.user_id)])];
  const admin = createAdminClient();
  const [{ data: people }, { data: staff }] = await Promise.all([
    authorIds.length ? admin.from('profiles').select('id, full_name').in('id', authorIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    admin.from('course_instructors').select('instructor_id').eq('course_id', course.id),
  ]);
  const staffIds = (staff ?? []).map((s) => s.instructor_id as string);
  const names: Record<string, string> = {};
  for (const p of people ?? []) names[p.id] = staffIds.includes(p.id) ? p.full_name : p.full_name.split(' ')[0] || '—';

  const ordered = (sections ?? []).flatMap((s) => [...(s.lessons as any[])].sort((a, b) => a.position - b.position));
  const lessonTitles = Object.fromEntries(ordered.map((l) => [l.id, l.title]));
  const idx = ordered.findIndex((l) => l.id === lesson.id);

  return (
    <LessonPanel
      courseId={course.id} slug={slug} lesson={{ id: lesson.id, title: lesson.title, description: lesson.description, type: lesson.type }}
      body={content?.body ?? null} startAt={progress?.position_seconds ?? 0} completed={!!progress?.completed}
      prevHref={ordered[idx - 1] ? `/learn/${slug}/${ordered[idx - 1].id}` : undefined} nextHref={ordered[idx + 1] ? `/learn/${slug}/${ordered[idx + 1].id}` : undefined}
      resources={(resources ?? []) as any} notes={notes ?? []} discussions={discussions ?? []} replies={replies ?? []} names={names}
      staffIds={staffIds} viewerId={user.id} canModerate={mod.data === true} announcements={announcements ?? []} lessonTitles={lessonTitles}
    />
  );
}
