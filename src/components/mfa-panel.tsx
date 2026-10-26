'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, Input, Label } from '@/components/ui/primitives';
import { useT } from '@/lib/i18n/provider';

type State =
  | { step: 'loading' }
  | { step: 'active' }
  | { step: 'challenge'; factorId: string }
  | { step: 'none' }
  | { step: 'enroll'; factorId: string; qr: string; secret: string };

/** TOTP multi-factor setup/verification using Supabase Auth MFA (free). */
export function MfaPanel({ required }: { required: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [state, setState] = useState<State>({ step: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const supabase = createBrowserSupabase();

  const refresh = useCallback(async () => {
    const [{ data: factors }, { data: aal }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
    const verified = factors?.totp?.find((f) => f.status === 'verified');
    if (!verified) return setState({ step: 'none' });
    setState(aal?.currentLevel === 'aal2' ? { step: 'active' } : { step: 'challenge', factorId: verified.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function startEnroll() {
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) return setError(t('err.generic'));
    setState({ step: 'enroll', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(factorId: string) {
    setError(null);
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
    if (e1 || !ch) return setError(t('err.generic'));
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    if (e2) return setError(t('mfa.bad_code'));
    setCode('');
    await refresh();
    router.refresh();
    if (required) router.push('/admin');
  }

  if (state.step === 'loading') return <p aria-busy="true">…</p>;
  return (
    <div className="space-y-4">
      {required && state.step !== 'active' && <Alert tone="warn">{t('mfa.required')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {state.step === 'active' && <Alert tone="success">{t('mfa.active')}</Alert>}
      {state.step === 'none' && (<><p className="text-sm text-muted-foreground">{t('mfa.intro')}</p><Button onClick={startEnroll}>{t('mfa.enable')}</Button></>)}
      {state.step === 'enroll' && (
        <div className="space-y-3">
          <p className="text-sm">{t('mfa.scan')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt={t('mfa.qr_alt')} className="h-44 w-44 rounded border border-border bg-white p-2" />
          <p className="text-xs text-muted-foreground">{t('mfa.manual')} <code className="select-all break-all">{state.secret}</code></p>
          <CodeForm code={code} setCode={setCode} onSubmit={() => verify(state.factorId)} label={t('mfa.code')} submit={t('mfa.verify')} />
        </div>
      )}
      {state.step === 'challenge' && <CodeForm code={code} setCode={setCode} onSubmit={() => verify(state.factorId)} label={t('mfa.code')} submit={t('mfa.verify')} />}
    </div>
  );
}

function CodeForm({ code, setCode, onSubmit, label, submit }: { code: string; setCode: (v: string) => void; onSubmit: () => void; label: string; submit: string }) {
  return (
    <div className="max-w-xs space-y-2">
      <Label htmlFor="mfa-code">{label}</Label>
      <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      <Button onClick={onSubmit} disabled={code.length !== 6}>{submit}</Button>
    </div>
  );
}
