import { Calendar, Clock, ExternalLink, MapPin } from 'lucide-react';
import { Link } from 'react-router';

import { pastEvents, upcomingEvents } from '../content/events';
import type { Route } from './+types/events';

export const meta: Route.MetaFunction = () => [{ title: 'Events · Tried Gold' }];

export const loader = () => ({ upcomingEvents, pastEvents });

const button =
  'inline-flex items-center rounded-md bg-ink px-4 py-2 text-ground transition-opacity hover:opacity-90';

export default function Events(props: Route.ComponentProps) {
  const { upcomingEvents, pastEvents } = props.loaderData;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-semibold text-ink">Events</h1>

      <p className="mb-12">
        At Tried Gold, we offer a variety of events designed to foster spiritual growth, build
        community, and provide practical wisdom for navigating life's challenges. From workshops and
        study groups to service opportunities and special gatherings, our events aim to equip and
        encourage participants in their faith journey.
      </p>

      <section className="mb-16">
        <h2 className="mb-6 text-3xl font-semibold text-ink">Upcoming Events</h2>

        <div className="space-y-8">
          {upcomingEvents.map((event) => (
            <article key={event.id} className="rounded-lg border border-rule p-6 shadow-sm">
              <h3 className="mb-3 text-2xl font-semibold text-ink">{event.title}</h3>

              <div className="mb-4 space-y-3">
                <div className="flex items-start">
                  <Calendar className="mt-0.5 mr-3 size-5 shrink-0 text-gold" aria-hidden="true" />
                  <span>{event.date}</span>
                </div>
                <div className="flex items-start">
                  <Clock className="mt-0.5 mr-3 size-5 shrink-0 text-gold" aria-hidden="true" />
                  <span>{event.time}</span>
                </div>
                <div className="flex items-start">
                  <MapPin className="mt-0.5 mr-3 size-5 shrink-0 text-gold" aria-hidden="true" />
                  <span>{event.location}</span>
                </div>
              </div>

              <p className="mb-6">{event.description}</p>

              <a href={event.registrationLink} className={button}>
                Register <ExternalLink className="ml-2 size-4" aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-3xl font-semibold text-ink">Past Events</h2>

        <div className="grid gap-6 md:grid-cols-2">
          {pastEvents.map((event) => (
            <article key={event.id} className="rounded-lg bg-surface p-5">
              <h3 className="mb-2 text-xl font-semibold text-ink">{event.title}</h3>
              <div className="mb-3 text-sm text-muted">{event.date}</div>
              <p className="text-sm">{event.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-lg bg-surface p-6">
        <h2 className="mb-4 text-2xl font-semibold text-ink">
          Want to stay updated on our events?
        </h2>
        <p className="mb-6">
          Join our mailing list to receive notifications about upcoming events and activities.
        </p>
        <Link to="/contact" className={button}>
          Contact Us
        </Link>
      </section>
    </div>
  );
}
