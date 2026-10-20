/**
 * The domain's mail, owned by the stack (`../../alchemy.run.ts`):
 *
 * - `SendingDomain`: the domain onboarded to Email Sending, which the list's
 *   letters are sent from (`FROM`, `../mail/mailer.ts`). On Cloudflare DNS
 *   its records (DKIM, SPF and the bounce path) are added for it. Message
 *   previews are off, so Cloudflare keeps no copy of a letter; Email Sending
 *   has no open or click tracking to turn off, and the letters carry none
 *   (`../mail/letters.ts`). Every stage declares it, takes the one already
 *   there, and never deletes it: prod and a throwaway stage send from the
 *   same domain, so destroying one must not stop the other.
 * - In prod, the contact address (`CONTACT`): Email Routing on the zone, the
 *   owner's inbox as a destination, and one rule that forwards the contact
 *   address to it. The inbox is read from `MAIL_FORWARD_TO` in the deployer's
 *   `.env` and is never in the repository. Cloudflare sends it a
 *   verification email when it is first added, and takes a forwarding rule
 *   only to a verified destination, so the rule is declared once
 *   `MAIL_FORWARD_VERIFIED` is true: on the deploy after its link is opened.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import { Config, Effect, Redacted } from 'effect';

import { CONTACT, DOMAIN } from '../site.ts';

/** The contact address forwarded to the owner's inbox: prod's alone. */
const contact = Effect.gen(function* () {
  const inbox = yield* Config.Redacted('MAIL_FORWARD_TO');
  const routing = yield* Cloudflare.Email.Routing('MailRouting', { zone: DOMAIN });
  const owner = yield* Cloudflare.Email.Address('OwnerInbox', { email: Redacted.value(inbox) });
  const verified = yield* Config.Boolean('MAIL_FORWARD_VERIFIED').pipe(Config.withDefault(false));
  if (!verified) return;
  yield* Cloudflare.Email.Rule('Contact', {
    zone: { zoneId: routing.zoneId, name: DOMAIN },
    name: 'Contact',
    matchers: [{ type: 'literal', field: 'to', value: CONTACT }],
    actions: [{ type: 'forward', value: [owner.email] }],
  });
});

export const MailDomain = Effect.gen(function* () {
  const zone = yield* Cloudflare.Zone.Zone('Zone', { name: DOMAIN }).pipe(
    Alchemy.AdoptPolicy.adopt(true),
  );
  const sending = yield* Cloudflare.Email.SendingSubdomain('SendingDomain', {
    zoneId: zone.zoneId,
    name: DOMAIN,
    previewEnabled: false,
  }).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());
  if ((yield* Stage) === 'prod') yield* contact;
  return { sending: sending.enabled };
});
