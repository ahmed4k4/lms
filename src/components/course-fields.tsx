import { Field } from '@/components/action-form';
import { Input, Select, Textarea } from '@/components/ui/primitives';
import type { DictKey, Locale } from '@/lib/i18n/shared';

type Course = { outcomes?: string[]; requirements?: string[]; audience?: string[]; title?: string; subtitle?: string | null; description?: string; category_id?: string | null; language?: string; level?: string };

export function CourseFields({ course = {}, categories, locale, t }: { course?: Course; categories: { id: string; name_en: string; name_ar: string }[]; locale: Locale; t: (k: DictKey) => string }) {
  return (
    <>
      <Field label={t('course.f_title')} htmlFor="title"><Input id="title" name="title" required minLength={3} maxLength={140} defaultValue={course.title} /></Field>
      <Field label={t('course.f_subtitle')} htmlFor="subtitle"><Input id="subtitle" name="subtitle" maxLength={200} defaultValue={course.subtitle ?? ''} /></Field>
      <Field label={t('course.f_description')} htmlFor="description"><Textarea id="description" name="description" maxLength={20000} className="min-h-40" defaultValue={course.description} /></Field>
      <Field label={t('course.f_outcomes')} htmlFor="outcomes" hint={t('course.f_lines_hint')}><Textarea id="outcomes" name="outcomes" className="min-h-32" defaultValue={(course.outcomes ?? []).join('\n')} /></Field>
      <Field label={t('course.f_requirements')} htmlFor="requirements" hint={t('course.f_lines_hint')}><Textarea id="requirements" name="requirements" defaultValue={(course.requirements ?? []).join('\n')} /></Field>
      <Field label={t('course.f_audience')} htmlFor="audience" hint={t('course.f_lines_hint')}><Textarea id="audience" name="audience" defaultValue={(course.audience ?? []).join('\n')} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('catalog.category')} htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue={course.category_id ?? ''}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{locale === 'ar' ? c.name_ar : c.name_en}</option>)}
          </Select>
        </Field>
        <Field label={t('catalog.language')} htmlFor="language">
          <Select id="language" name="language" defaultValue={course.language ?? locale}><option value="en">English</option><option value="ar">العربية</option></Select>
        </Field>
        <Field label={t('course.f_level')} htmlFor="level">
          <Select id="level" name="level" defaultValue={course.level ?? 'all'}>
            {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}
          </Select>
        </Field>
      </div>
    </>
  );
}
