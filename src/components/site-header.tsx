import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';
import { getAuth, isAdminRole } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { logoutAction } from '@/actions/auth';
import { LangSwitcher } from '@/components/lang-switcher';
import { NavLinks } from '@/components/nav-links';
import { LogoMark } from '@/components/ui/brand';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

export async function SiteHeader() {
  const { t } = await getT();
  const { user, profile, roles, supabase } = await getAuth();
  let unread = 0;
  if (user) {
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    unread = count ?? 0;
  }
  const links: { href: string; label: string }[] = [{ href: '/courses', label: t('nav.courses') }];
  if (user) links.push({ href: '/dashboard', label: t('nav.my_learning') });
  if (roles.includes('instructor')) links.push({ href: '/instructor', label: t('nav.instructor') });
  if (isAdminRole(roles)) links.push({ href: '/admin', label: t('nav.admin') });

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-3 rounded-md" aria-label={BRAND.name}>
          <LogoMark size={40} />
          <span className="flex flex-col leading-none">
            <span dir="ltr" className="font-display text-[19px] font-semibold tracking-tight text-silver">Archai</span>
            <span dir="ltr" className="mt-1 font-mono text-[9px] font-medium tracking-[0.22em] text-muted-foreground">ACADEMY</span>
          </span>
        </Link>
        <nav className="ms-6 hidden items-center gap-1 md:flex" aria-label={t('nav.main')}><NavLinks links={links} /></nav>
        <div className="ms-auto flex items-center gap-1.5">
          <LangSwitcher />
          {user ? (
            <>
              <Link href="/notifications" className="relative rounded-md p-2 text-silver hover:bg-steel hover:text-foreground" aria-label={t('nav.notifications')}>
                <Bell className="h-5 w-5" strokeWidth={1.75} />
                {unread > 0 && <span className="absolute end-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-arc ring-2 ring-background" aria-hidden />}
              </Link>
              <Link href="/account" className="hidden max-w-[10rem] truncate rounded-md px-3 py-2 text-sm font-semibold text-silver hover:text-foreground sm:block">{profile?.full_name || t('nav.account')}</Link>
              <form action={logoutAction}><button className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>{t('nav.logout')}</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>{t('nav.login')}</Link>
              <Link href="/register" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden sm:inline-flex')}>{t('nav.register')}</Link>
            </>
          )}
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded-md p-2 text-silver hover:bg-steel" aria-label={t('nav.menu')}><Menu className="h-5 w-5" strokeWidth={1.75} /></summary>
            <div className="absolute end-0 mt-2 flex w-60 flex-col rounded-lg border border-border bg-card p-2 shadow-2xl">
              <NavLinks links={links} itemClass="py-2.5" />
              {!user && <Link href="/register" className="rounded-md px-3 py-2.5 text-sm font-semibold text-silver hover:text-foreground">{t('nav.register')}</Link>}
              {user && <Link href="/account" className="rounded-md px-3 py-2.5 text-sm font-semibold text-silver hover:text-foreground">{t('nav.account')}</Link>}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
