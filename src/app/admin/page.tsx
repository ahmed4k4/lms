import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { Card, CardBody } from '@/components/ui/primitives';

export const metadata = { title: 'Admin' };

export default async function AdminHome() {
  const { admin } = await requirePermission('users.manage');
  const { t } = await getT();
  const count = async (table: string, f?: (q: any) => any) => {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    if (f) q = f(q);
    return (await q).count ?? 0;
  };
  const [users, instructors, inReview, published, enrollments, sharing] = await Promise.all([
    count('profiles'), count('instructor_profiles'), count('courses', (q) => q.eq('status', 'in_review')), count('courses', (q) => q.eq('status', 'published')),
    count('enrollments'), count('audit_logs', (q) => q.eq('action', 'security.suspicious_sharing').gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())),
  ]);
  const tiles: [string, number, string?][] = [
    [t('admin.stat_users'), users, '/admin/users'], [t('admin.stat_instructors'), instructors, '/admin/instructors'],
    [t('admin.stat_review'), inReview, '/admin/courses'], [t('admin.stat_published'), published], [t('admin.stat_enrollments'), enrollments],
    [t('admin.stat_sharing'), sharing, '/admin/audit'],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">{t('admin.overview')}</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles.map(([label, n, href]) => {
          const body = <Card><CardBody><p className="text-sm text-muted-foreground">{label}</p><p className="font-display text-3xl">{n}</p></CardBody></Card>;
          return href ? <Link key={label} href={href}>{body}</Link> : <div key={label}>{body}</div>;
        })}
      </div>
    </div>
  );
}
