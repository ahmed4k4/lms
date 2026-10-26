import { requirePermission } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { setInstructorStatusAction } from '@/actions/admin';
import { CreateInstructorForm } from '@/components/create-instructor-form';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export default async function AdminInstructors() {
  const { admin } = await requirePermission('instructors.manage');
  const { t, locale } = await getT();
  const { data: rows } = await admin.from('instructor_profiles').select('user_id, status, created_at, profiles(full_name)').order('created_at', { ascending: false });
  const { data: emails } = await admin.rpc('user_emails', { p_ids: (rows ?? []).map((r) => r.user_id) });
  const email = (id: string) => (emails as { id: string; email: string }[] | null)?.find((e) => e.id === id)?.email;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">{t('admin.instructors')}</h1>
      <Card><CardHeader><h2 className="text-lg">{t('admin.create_instructor')}</h2></CardHeader><CardBody><CreateInstructorForm /></CardBody></Card>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-start">{t('auth.full_name')}</th><th className="p-3 text-start">{t('auth.email')}</th><th className="p-3 text-start">{t('instr.col_status')}</th><th className="p-3 text-start">{t('instr.col_updated')}</th><th /></tr></thead>
          <tbody>{(rows ?? []).map((r: any) => (
            <tr key={r.user_id} className="border-t border-border">
              <td className="p-3">{(Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.full_name}</td><td className="p-3" dir="ltr">{email(r.user_id)}</td>
              <td className="p-3"><Badge tone={r.status === 'active' ? 'success' : 'danger'}>{t(`istatus.${r.status}` as never)}</Badge></td>
              <td className="p-3">{formatDate(r.created_at, locale)}</td>
              <td className="p-3 text-end"><form action={setInstructorStatusAction.bind(null, r.user_id, r.status === 'active' ? 'suspended' : 'active')}><Button size="sm" variant="outline">{r.status === 'active' ? t('admin.suspend') : t('admin.activate')}</Button></form></td>
            </tr>))}</tbody></table>
      </div>
    </div>
  );
}
