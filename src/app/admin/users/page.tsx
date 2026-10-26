import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { changeRoleAction, setAccountStatusAction } from '@/actions/admin';
import { Badge, Input, Select } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

const PAGE = 25;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { admin, supabase } = await requirePermission('users.manage');
  const { t } = await getT();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const q = (sp.q ?? '').replace(/[%,()*\\:"']/g, ' ').trim().slice(0, 60);
  let query = admin.from('profiles').select('id, full_name, status, user_roles(roles(key))', { count: 'exact' }).order('created_at', { ascending: false });
  if (q) query = query.ilike('full_name', `%${q}%`);
  const { data: users, count } = await query.range((page - 1) * PAGE, page * PAGE - 1);
  const { data: emails } = await admin.rpc('user_emails', { p_ids: (users ?? []).map((u) => u.id) });
  const { data: canRoles } = await supabase.rpc('has_permission', { p_perm: 'admins.manage' });
  const email = (id: string) => (emails as { id: string; email: string }[] | null)?.find((e) => e.id === id)?.email;
  const rolesOf = (u: any): string[] => (u.user_roles ?? []).map((r: any) => (Array.isArray(r.roles) ? r.roles[0]?.key : r.roles?.key)).filter(Boolean);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  return (
    <div className="space-y-4">
      <h1 className="text-3xl">{t('admin.users')}</h1>
      <form className="flex gap-2" role="search"><Input name="q" defaultValue={q} placeholder={t('admin.search_users')} aria-label={t('admin.search_users')} className="max-w-sm" /><Button variant="outline">{t('catalog.apply')}</Button></form>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-start">{t('auth.full_name')}</th><th className="p-3 text-start">{t('auth.email')}</th><th className="p-3 text-start">{t('admin.roles')}</th><th className="p-3 text-start">{t('instr.col_status')}</th><th className="p-3 text-start">{t('admin.actions')}</th></tr></thead>
          <tbody>{(users ?? []).map((u: any) => {
            const r = rolesOf(u);
            const protectedUser = r.includes('super_admin');
            return (
              <tr key={u.id} className="border-t border-border align-top">
                <td className="p-3">{u.full_name || '—'}</td><td className="p-3" dir="ltr">{email(u.id)}</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{r.map((k) => <Badge key={k} tone={k === 'student' ? 'neutral' : 'brand'}>{k}</Badge>)}</div></td>
                <td className="p-3"><Badge tone={u.status === 'active' ? 'success' : 'danger'}>{t(`astatus.${u.status}` as never)}</Badge></td>
                <td className="space-y-2 p-3">
                  {!protectedUser && (u.status === 'active'
                    ? <form action={setAccountStatusAction.bind(null, u.id, true)} className="flex gap-1"><Input name="reason" placeholder={t('admin.reason')} aria-label={t('admin.reason')} className="h-8 w-40" maxLength={300} /><Button size="sm" variant="destructive">{t('admin.suspend')}</Button></form>
                    : <form action={setAccountStatusAction.bind(null, u.id, false)}><Button size="sm" variant="outline">{t('admin.activate')}</Button></form>)}
                  {canRoles === true && !protectedUser && (
                    <form action={changeRoleAction} className="flex gap-1"><input type="hidden" name="userId" value={u.id} />
                      <Select name="role" defaultValue={r.includes('admin') ? 'admin' : r.includes('instructor') ? 'instructor' : 'student'} className="h-8 w-32" aria-label={t('admin.roles')}><option value="student">student</option><option value="instructor">instructor</option><option value="admin">admin</option></Select>
                      <Button size="sm" variant="outline">{t('action.save')}</Button></form>)}
                </td>
              </tr>);
          })}</tbody></table>
      </div>
      {pages > 1 && <div className="flex items-center gap-4 text-sm">{page > 1 && <Link className="text-primary underline" href={`/admin/users?q=${q}&page=${page - 1}`}>{t('action.previous')}</Link>}<span>{page}/{pages}</span>{page < pages && <Link className="text-primary underline" href={`/admin/users?q=${q}&page=${page + 1}`}>{t('action.next')}</Link>}</div>}
    </div>
  );
}
