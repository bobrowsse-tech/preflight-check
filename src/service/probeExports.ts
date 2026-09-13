/** Re-export helpers tests may want without circular imports. */
export { suggestFix } from './probe';
export { normalizeVersion } from './expectations';

import { normalizeVersion } from './expectations';
import * as semver from 'semver';

export function versionsMatchSafe(expected: string, actual: string): boolean {
  const exp = normalizeVersion(expected);
  const act = normalizeVersion(actual);
  if (!act) {
    return false;
  }
  if (semver.validRange(exp) && !semver.valid(exp)) {
    const coerced = semver.coerce(act);
    return coerced ? semver.satisfies(coerced, exp) : false;
  }
  const expCoerced = semver.coerce(exp);
  const actCoerced = semver.coerce(act);
  if (expCoerced && actCoerced) {
    if (/^\d+\.\d+$/.test(exp)) {
      return expCoerced.major === actCoerced.major && expCoerced.minor === actCoerced.minor;
    }
    if (/^\d+$/.test(exp)) {
      return expCoerced.major === actCoerced.major;
    }
    return semver.eq(expCoerced, actCoerced) || act.startsWith(exp);
  }
  return act === exp || act.startsWith(exp);
}
