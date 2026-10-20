/**
 * An email address as the list keeps it: trimmed and lowercased, so one
 * inbox is one row, and plain enough to put in a `to` field as it is. The
 * rule is the shape every mailbox a person types has (a local part, an `@`
 * and a domain of letters, digits and hyphens with a dot in it), not the
 * whole of RFC 5322: quoted local parts, comments and IP literals are
 * refused, and nothing that could break a header (a space, a comma, an
 * angle bracket, a line break) gets through.
 */
import { Option, Schema } from 'effect';

export const Address = Schema.String.pipe(Schema.brand('Address'));
export type Address = typeof Address.Type;

/** The longest address SMTP carries (RFC 5321's path less its brackets). */
const MAX_LENGTH = 254;
const MAX_LOCAL = 64;

const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP = /^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/;

/** The address as the list keeps it, or none when it is not one. */
export const addressOf = (typed: string): Option.Option<Address> => {
  const address = typed.trim().toLowerCase();
  if (address.length > MAX_LENGTH) return Option.none();
  const at = address.lastIndexOf('@');
  const local = address.slice(0, at);
  const labels = address.slice(at + 1).split('.');
  const top = labels.at(-1) ?? '';
  const valid =
    at > 0 &&
    local.length <= MAX_LOCAL &&
    LOCAL.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    TOP.test(top);
  if (!valid) return Option.none();
  return Option.some(Address.make(address));
};
