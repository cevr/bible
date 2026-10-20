/**
 * One 2.9 generates the app's iOS SDK bindings (`OneSDKBindings`) from the
 * iphonesimulator SDK (onejs/one#991). Foundation declares `NSSocketPort`
 * only for macOS and the simulator, so each generated `case` line that
 * names `Foundation.SocketPort` breaks every device build. `guardSocketPort`
 * puts each such line under a simulator-only `#if`, marked as this step's
 * own, so a second run finds its own guards and changes nothing.
 */

/** The `#if` this step writes over a `SocketPort` case. */
export const marker =
  '#if targetEnvironment(simulator) // onejs/one#991: SocketPort is simulator-only';

/**
 * What the step found in the generated Foundation table:
 * - `Guarded`: cases a device build would compile, now under the marker;
 * - `AlreadyGuarded`: every case is under the marker already;
 * - `Gone`: One no longer writes a `SocketPort` case outside a simulator
 *   guard of its own, so the step has nothing to do and should be removed.
 */
export type Guard =
  | { readonly _tag: 'Guarded'; readonly source: string; readonly cases: number }
  | { readonly _tag: 'AlreadyGuarded'; readonly cases: number }
  | { readonly _tag: 'Gone' };

const isSocketPortCase = (line: string) =>
  line.trimStart().startsWith('case ') && line.includes('Foundation.SocketPort');

/** Each open `#if` branch, innermost last: whether it holds for the simulator only, and whether it is the marker. */
type Branch = { readonly simulator: boolean; readonly ours: boolean };

const directive = (line: string) => line.trimStart().split(/\s/, 1)[0];

export const guardSocketPort = (source: string): Guard => {
  const branches: Array<Branch> = [];
  const out: Array<string> = [];
  let guarded = 0;
  let ours = 0;
  for (const line of source.split('\n')) {
    switch (directive(line)) {
      case '#if':
        branches.push({
          simulator: /targetEnvironment\(simulator\)/.test(line) && !line.includes('!'),
          ours: line.trim() === marker,
        });
        break;
      case '#elseif':
      case '#else':
        branches.splice(-1, 1, { simulator: false, ours: false });
        break;
      case '#endif':
        branches.pop();
        break;
    }
    if (!isSocketPortCase(line)) {
      out.push(line);
    } else if (branches.at(-1)?.ours === true) {
      ours += 1;
      out.push(line);
    } else if (branches.some((branch) => branch.simulator)) {
      out.push(line);
    } else {
      guarded += 1;
      out.push(marker, line, '#endif');
    }
  }
  if (guarded > 0) return { _tag: 'Guarded', source: out.join('\n'), cases: guarded };
  if (ours > 0) return { _tag: 'AlreadyGuarded', cases: ours };
  return { _tag: 'Gone' };
};
