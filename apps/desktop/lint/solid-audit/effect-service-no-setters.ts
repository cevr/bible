import type { AstNode, SolidRule } from './ast.ts';
import {
  getNodeArrayField,
  getNodeField,
  getStringField,
  memberKeyName,
  SETTER_NAME,
} from './ast.ts';

/**
 * R6 — `solid/effect-service-no-setters`
 *
 * Catches Effect.Service / Context.Service shape interfaces (named
 * `*Shape`) whose properties match `^set[A-Z]`. The desktop app's
 * convention is `export class Foo extends Context.Service<Foo, FooShape>()`
 * where `FooShape` is a sibling TS interface listing the service surface.
 * A property like `readonly setTheme: (...) => Effect.Effect<void>` is a
 * signal-setter leaking into the domain — A4 migrated all 15 of these to
 * domain verbs (`themeChosen`, `lineHeightAdjusted`, …). This rule
 * prevents regression.
 *
 * Heuristic: any `TSInterfaceDeclaration` whose `id.name` ends in `Shape`
 * AND any `TSPropertySignature` / `TSMethodSignature` whose `key.name`
 * matches `/^set[A-Z]/`. Catches both `readonly setX: (...) => Effect`
 * (property signature) and `setX(...): Effect` (method signature) forms.
 *
 * Also covers class methods on a `Context.Service` / `Effect.Service`
 * superclass — for the day someone writes one with class methods instead
 * of a returned shape literal.
 */
export const effectServiceNoSetters: SolidRule = {
  create(context) {
    const reportSetters = (members: ReadonlyArray<AstNode>, container: string): void => {
      for (const member of members) {
        if (
          member.type !== 'TSPropertySignature' &&
          member.type !== 'TSMethodSignature' &&
          member.type !== 'MethodDefinition'
        ) {
          continue;
        }
        const name = memberKeyName(member);
        if (name === undefined || !SETTER_NAME.test(name)) continue;
        context.report({
          message:
            `Effect service ${container} declares \`${name}\` — \`set*\` is signal-setter ` +
            `naming and bleeds reactivity vocabulary into the domain layer. Use a domain ` +
            `verb (e.g. \`${name.slice(3, 4).toLowerCase()}${name.slice(4)}Chosen\`, ` +
            `\`Adjusted\`, \`Toggled\`). See SOLID_AUDIT.md §A4.`,
          node: member,
        });
      }
    };

    return {
      TSInterfaceDeclaration(node) {
        const id = getNodeField(node, 'id');
        const name = id === undefined ? undefined : getStringField(id, 'name');
        if (name === undefined || !name.endsWith('Shape')) return;
        const body = getNodeField(node, 'body');
        const members = body === undefined ? undefined : getNodeArrayField(body, 'body');
        if (members === undefined) return;
        reportSetters(members, name);
      },
      ClassDeclaration(node) {
        // Detect `class X extends Context.Service<...>()(...)` or
        // `class X extends Effect.Service<...>()(...)` — superClass is a
        // CallExpression chain rooted at `Context.Service`/`Effect.Service`.
        const superClass = getNodeField(node, 'superClass');
        if (superClass === undefined) return;
        // Walk down through CallExpression -> callee until we hit the
        // MemberExpression with Service.
        let cursor: AstNode | undefined = superClass;
        let foundService = false;
        for (let depth = 0; depth < 6 && cursor !== undefined; depth++) {
          if (cursor.type === 'CallExpression') {
            cursor = getNodeField(cursor, 'callee');
            continue;
          }
          if (cursor.type === 'MemberExpression') {
            const object = getNodeField(cursor, 'object');
            const property = getNodeField(cursor, 'property');
            const objectName =
              object?.type === 'Identifier' ? getStringField(object, 'name') : undefined;
            const propertyName =
              property?.type === 'Identifier' ? getStringField(property, 'name') : undefined;
            if (
              propertyName === 'Service' &&
              (objectName === 'Context' || objectName === 'Effect')
            ) {
              foundService = true;
            }
            break;
          }
          break;
        }
        if (!foundService) return;
        const body = getNodeField(node, 'body');
        const members = body === undefined ? undefined : getNodeArrayField(body, 'body');
        if (members === undefined) return;
        const idNode = getNodeField(node, 'id');
        const className =
          idNode === undefined ? '<anonymous>' : (getStringField(idNode, 'name') ?? '<anonymous>');
        reportSetters(members, className);
      },
    };
  },
};
