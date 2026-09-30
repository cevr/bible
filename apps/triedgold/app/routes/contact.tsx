import { Mail, MapPin } from 'lucide-react';

import type { Route } from './+types/contact';

export const meta: Route.MetaFunction = () => [{ title: 'Contact · Tried Gold' }];

export default function Contact() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-semibold text-ink">Contact Us</h1>

      <p className="mb-6">
        We'd love to hear from you. Whether you have questions about our programs, want to attend an
        event, or are interested in collaborating, please reach out using the contact information
        below.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-1 size-6 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold text-ink">Email</h2>
            <a href="mailto:info@triedgold.com" className="hover:text-accent hover:underline">
              info@triedgold.com
            </a>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <MapPin className="mt-1 size-6 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold text-ink">Location</h2>
            <p>
              Our events are held at various locations. Please contact us for specific event
              details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
