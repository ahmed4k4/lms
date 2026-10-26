import Link from 'next/link';
import { getT } from '@/lib/i18n';
import { registerAction } from '@/actions/auth';
import { ActionForm, Field } from '@/components/action-form';
import { Input } from '@/components/ui/primitives';
import { AuthShell } from '@/components/auth-shell';

export const metadata = { title: 'Create account' };

export default async function RegisterPage() {
  const { t } = await getT();
  return (
    <AuthShell title={t('auth.register_title')} subtitle={t('auth.register_sub')}>
      <ActionForm action={registerAction} submitLabel={t('nav.register')}>
        <Field label={t('auth.full_name')} htmlFor="fullName"><Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100} /></Field>
        <Field label={t('auth.email')} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label={t('auth.password')} htmlFor="password" hint={t('auth.password_hint')}><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} /></Field>
      </ActionForm>
      <p className="text-sm text-muted-foreground">{t('auth.have_account')} <Link href="/login" className="font-semibold text-arc hover:underline">{t('nav.login')}</Link></p>
    </AuthShell>
  );
}
