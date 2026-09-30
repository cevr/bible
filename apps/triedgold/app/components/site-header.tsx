import { MenuIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Logo } from './logo';

/** The site's sections, in the order the header lists them. */
export const sections = [
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="relative px-4 py-6">
      <div className="container mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-serif text-3xl font-semibold text-ink">
          <Logo className="size-8" />
          Tried Gold
        </Link>

        <button
          type="button"
          className="group p-2 text-ink md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MenuIcon className="size-6 group-aria-expanded:hidden" />
          <XIcon className="hidden size-6 group-aria-expanded:block" />
        </button>

        <nav
          data-open={open}
          className="absolute top-20 right-0 left-0 z-10 hidden bg-surface p-4 shadow-lg data-[open=true]:block md:static md:block md:bg-transparent md:p-0 md:shadow-none"
        >
          <ul className="flex flex-col gap-4 md:flex-row md:gap-6">
            {sections.map((section) => (
              <li key={section.to}>
                <Link
                  to={section.to}
                  className="block py-2 text-ink hover:text-accent hover:underline md:py-0"
                  onClick={close}
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
