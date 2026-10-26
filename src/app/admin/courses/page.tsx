import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { reviewCourseAction } from '@/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Badge, EmptyState, Input, Select } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

const STATUSES = ['in_review', 'published', 'draft', 'rejected', 'suspended', 'archived'] as const;

export default async function AdminCourses({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { admin } = await requirePermission('courses.review');
  const { t } = await getT();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? sp.status! : 'in_review';
  const { data: courses } = await admin.from('courses').select('id, slug, title, status, rejection_reason, updated_at, profiles:created_by(full_name)').eq('status', status).order('updated_at', { ascending: false }).limit(100);
  const reasonInput = <Input name="reason" placeholder={t('admin.reason')} aria-label={t('admin.reason')} required minLength={3} maxLength={1000} className="h-8 w-56" />;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">{t('admin.courses')}</h1>
      <form className="flex gap-2"><Select name="status" defaultValue={status} className="max-w-48" aria-label={t('instr.col_status')}>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}</Select><Button variant="outline">{t('catalog.apply')}</Button></form>
      {courses?.length ? (
        <ul className="space-y-3">{courses.map((c: any) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2"><Link href={`/learn/${c.slug}`} className="font-medium text-primary hover:underline">{c.title}</Link><Badge>{t(`status.${c.status}` as never)}</Badge><span className="text-sm text-muted-foreground">{(Array.isArray(c.profiles) ? c.profiles[0] : c.profiles)?.full_name}</span></div>
            {c.rejection_reason && <p className="mt-1 text-sm text-muted-foreground">{c.rejection_reason}</p>}
            <div className="mt-3 flex flex-wrap items-start gap-4">
              {c.status === 'in_review' && <>
                <ActionForm action={reviewCourseAction.bind(null, c.id, 'approve')} submitLabel={t('admin.approve')} className="flex gap-2"><span className="sr-only">{c.title}</span></ActionForm>
                <ActionForm action={reviewCourseAction.bind(null, c.id, 'reject')} submitLabel={t('admin.reject')} variant="destructive" className="flex flex-wrap gap-2">{reasonInput}</ActionForm></>}
              {c.status === 'published' && <>
                <ActionForm action={reviewCourseAction.bind(null, c.id, 'suspend')} submitLabel={t('admin.suspend')} variant="destructive" className="flex flex-wrap gap-2">{reasonInput}</ActionForm>
                <ActionForm action={reviewCourseAction.bind(null, c.id, 'archive')} submitLabel={t('admin.archive')} variant="outline" className="flex gap-2"><span className="sr-only">{c.title}</span></ActionForm></>}
              {['suspended', 'archived'].includes(c.status) && <ActionForm action={reviewCourseAction.bind(null, c.id, 'restore')} submitLabel={t('admin.restore')} variant="outline" className="flex gap-2"><span className="sr-only">{c.title}</span></ActionForm>}
            </div>
          </li>))}</ul>
      ) : <EmptyState title={t('admin.none')} />}
    </div>
  );
}
