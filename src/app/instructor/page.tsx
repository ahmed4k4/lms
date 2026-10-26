import Link from 'next/link';
import { requireInstructor } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';

export const metadata = { title: 'Instructor dashboard' };
const TONE: Record<string, 'neutral' | 'success' | 'warn' | 'danger'> = { draft: 'neutral', in_review: 'warn', published: 'success', rejected: 'danger', suspended: 'danger', archived: 'neutral' };

export default async function InstructorHome() {
  const { supabase, user } = await requireInstructor();
  const { t, locale } = await getT();
  const { data: rows } = await supabase.from('course_instructors').select('courses(id, title, status, updated_at)').eq('instructor_id', user.id);
  const courses = (rows ?? []).map((r: any) => (Array.isArray(r.courses) ? r.courses[0] : r.courses)).filter(Boolean)
    .sort((a: any, b: any) => +new Date(b.updated_at) - +new Date(a.updated_at));
  const ids = courses.map((c: any) => c.id);
  const { data: enr } = ids.length ? await supabase.from('enrollments').select('course_id').in('course_id', ids) : { data: [] };
  const count = (id: string) => (enr ?? []).filter((e) => e.course_id === id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">{t('instr.title')}</h1>
        <Link href="/instructor/courses/new" className={cn(buttonVariants())}>{t('instr.new_course')}</Link>
      </div>
      {courses.length ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-start"><tr><th className="p-3 text-start">{t('instr.col_course')}</th><th className="p-3 text-start">{t('instr.col_status')}</th><th className="p-3 text-start">{t('instr.col_students')}</th><th className="p-3 text-start">{t('instr.col_updated')}</th></tr></thead>
            <tbody>
              {courses.map((c: any) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3"><Link className="font-medium text-primary hover:underline" href={`/instructor/courses/${c.id}`}>{c.title}</Link></td>
                  <td className="p-3"><Badge tone={TONE[c.status]}>{t(`status.${c.status}` as never)}</Badge></td>
                  <td className="p-3">{count(c.id)}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(c.updated_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title={t('instr.empty')} hint={t('instr.empty_hint')} />}
    </div>
  );
}
