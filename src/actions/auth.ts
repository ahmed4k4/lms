'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { parseForm, loginSchema, registerSchema, emailSchema, newPasswordSchema, type ActionState } from '@/lib/validation';
import { getLocale, getT } from '@/lib/i18n';
import { safeNext } from '@/lib/utils';
import { publicEnv } from '@/lib/env';
import { fail, throttle } from './helpers';

async function siteUrl() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  // Prefer the configured URL: it must also be listed in Supabase "Redirect URLs".
  return publicEnv.siteUrl || (host ? `${proto}://${host}` : 'http://localhost:3000');
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const blocked = await throttle('login');
  if (blocked) return blocked;
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return fail('err.invalid_credentials');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail('err.invalid_credentials'); // same message for unknown user / wrong password
  redirect(safeNext(String(formData.get('next') ?? '')));
}

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const blocked = await throttle('register', 5, 3600);
  if (blocked) return blocked;
  const { t } = await getT();
  const parsed = parseForm(registerSchema, formData);
  if (!parsed.ok) return { error: parsed.error.includes('password') ? t('err.password_short') : t('err.invalid_input') };
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName, locale: await getLocale() }, emailRedirectTo: `${await siteUrl()}/auth/callback` },
  });
  // Do not reveal whether the email already exists.
  if (error && !/registered|exists/i.test(error.message)) return { error: t('err.generic') };
  return { ok: true, message: t('auth.check_email') };
}

export async function forgotPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const blocked = await throttle('forgot', 5, 3600);
  if (blocked) return blocked;
  const { t } = await getT();
  const parsed = parseForm(emailSchema, formData);
  if (!parsed.ok) return { error: t('err.invalid_input') };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password` });
  return { ok: true, message: t('auth.reset_sent') }; // always the same response
}

export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { t } = await getT();
  const parsed = parseForm(newPasswordSchema, formData);
  if (!parsed.ok) return { error: t('err.password_short') };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: t('err.link_expired') };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: t('err.generic') };
  await supabase.auth.signOut({ scope: 'others' }); // end every other session after a password change
  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function logoutOthersAction(): Promise<ActionState> {
  const { t } = await getT();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'others' });
  return { ok: true, message: t('account.others_signed_out') };
}

export async function setLocaleAction(formData: FormData) {
  const locale = formData.get('locale') === 'ar' ? 'ar' : 'en';
  (await cookies()).set('locale', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from('profiles').update({ locale }).eq('id', data.user.id);
  revalidatePath('/', 'layout');
  redirect(safeNext(String(formData.get('next') ?? ''), '/'));
}
