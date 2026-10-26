import { requirePermission } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { deleteCategoryAction, saveCategoryAction } from '@/actions/admin';
import { ActionForm } from '@/components/action-form';
import { ConfirmSubmit } from '@/components/form-bits';
import { Card, CardBody, Input } from '@/components/ui/primitives';

export default async function AdminCategories() {
  const { supabase } = await requirePermission('categories.manage');
  const { t } = await getT();
  const { data: cats } = await supabase.from('categories').select('id, slug, name_en, name_ar').order('position');
  const fields = (c?: { slug: string; name_en: string; name_ar: string }) => (
    <>
      <Input name="slug" placeholder="slug" aria-label="slug" defaultValue={c?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="w-36" dir="ltr" />
      <Input name="nameEn" placeholder="English" aria-label="English" defaultValue={c?.name_en} required className="w-44" />
      <Input name="nameAr" placeholder="العربية" aria-label="العربية" defaultValue={c?.name_ar} required className="w-44" />
    </>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">{t('admin.categories')}</h1>
      {cats?.map((c) => (
        <Card key={c.id}><CardBody className="flex flex-wrap items-start gap-2">
          <ActionForm action={saveCategoryAction.bind(null, c.id)} submitLabel={t('action.save')} variant="outline" className="flex flex-wrap items-start gap-2">{fields(c)}</ActionForm>
          <form action={deleteCategoryAction.bind(null, c.id)}><ConfirmSubmit size="sm" variant="ghost" message={t('instr.confirm_delete')}>{t('action.delete')}</ConfirmSubmit></form>
        </CardBody></Card>
      ))}
      <Card><CardBody><ActionForm action={saveCategoryAction.bind(null, null)} submitLabel={t('admin.add_category')} resetOnSuccess className="flex flex-wrap items-start gap-2">{fields()}</ActionForm></CardBody></Card>
    </div>
  );
}
