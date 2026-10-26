import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getT } from '@/lib/i18n';
import { getAuth } from '@/lib/auth';
import { safeNext } from '@/lib/utils';
import { loginAction } from '@/actions/auth';
import { ActionForm, Field } from '@/components/action-form';
import { Alert, Input } from '@/components/ui/primitives';
import { AuthShell } from '@/components/auth-shell';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getT();
  const sp = await searchParams;
  const { user, profile } = await getAuth();
  if (user && profile?.status === 'active') redirect(safeNext(sp.next));
  return (
    <AuthShell title={t('auth.login_title')} subtitle={t('auth.login_sub')}>
      {sp.error && <Alert tone="error">{t('err.link_expired')}</Alert>}
      <ActionForm action={loginAction} submitLabel={t('nav.login')}>
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field label={t('auth.email')} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label={t('auth.password')} htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      </ActionForm>
      <p className="text-sm"><Link href="/forgot-password" className="text-arc hover:underline">{t('auth.forgot')}</Link></p>
      <p className="text-sm text-muted-foreground">{t('auth.no_account')} <Link href="/register" className="font-semibold text-arc hover:underline">{t('nav.register')}</Link></p>
    </AuthShell>
  );
}
