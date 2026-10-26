import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { MfaPanel } from '@/components/mfa-panel';
import { Card, CardBody } from '@/components/ui/primitives';

export const metadata = { title: 'Account security' };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  await requireUser('/account/security');
  const { t } = await getT();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-3xl">{t('mfa.title')}</h1>
      <Card><CardBody><MfaPanel required={sp.required === '1'} /></CardBody></Card>
    </div>
  );
}
