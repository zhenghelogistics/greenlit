import { CONTAINER_NUMBER_PATTERN, normaliseContainerNumber } from './job-numbers.ts';

/**
 * Whether a container number is a container number.
 *
 * ISO 6346 builds a check digit into every box number, so a number can be
 * checked against itself with no lookup and no network. Four letters, six
 * digits, then a seventh digit that the first ten determine.
 *
 * ## Why this is worth having
 *
 * The number is how a box is identified everywhere it goes, and it reaches us
 * three ways, each of which gets it wrong differently:
 *
 *   typed      by somebody reading a notice on a screen beside them
 *   extracted  by the reader, which is confident and occasionally wrong
 *   scanned    by OCR, which confuses letters that look alike
 *
 * A scanned Evergreen notice read EITU3306045 as KITU3306045 — one letter, and
 * the check digit refuses it. That is the whole value: a wrong number is
 * caught where it is entered rather than at a gate, by a driver, with the
 * container already on the chassis.
 *
 * ## Why it warns rather than blocks
 *
 * A container that fails this is far more likely to be a typo than a real box
 * with a bad number, but real ones do exist — older equipment and some
 * shippers' own boxes are out there with numbers that do not check. Refusing
 * to record one would mean the only way to enter the truth is to enter it
 * wrongly, which is the trade §44.2.1 already made about Portnet.
 */

/**
 * The letter values ISO 6346 assigns.
 *
 * A is 10 and the rest follow, except that 11, 22 and 33 are skipped because
 * they are multiples of the modulus and would make different letters
 * indistinguishable.
 */
const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {};
  let n = 10;
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (n % 11 === 0) n += 1;
    values[letter] = n;
    n += 1;
  }
  return values;
})();

// The shape rule and the normaliser live in `job-numbers.ts` and are used
// from there. A second copy would be a second answer to "is this the right
// shape", and they would drift.

/**
 * The digit the first ten characters imply, or null if they are not ten
 * characters of the right shape.
 */
export function containerCheckDigit(number: string): number | null {
  const text = normaliseContainerNumber(String(number ?? ''));
  if (!/^[A-Z]{4}\d{6}/.test(text)) return null;

  let total = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = text[i]!;
    const value = /\d/.test(ch) ? Number(ch) : LETTER_VALUES[ch];
    if (value === undefined) return null;
    total += value * 2 ** i;
  }
  // The published rule is mod 11, then the result 10 is written as 0.
  return (total % 11) % 10;
}

export interface ContainerNumberCheck {
  /** Uppercased, with spaces and dashes taken out. */
  number: string;
  /** Whether it is the right shape at all. */
  wellFormed: boolean;
  /** Whether the check digit agrees with the rest. Null when not well formed. */
  checkDigitValid: boolean | null;
  /** What to say, in the words somebody entering it would use. Null when fine. */
  problem: string | null;
}

/**
 * Check a container number, and say what is wrong with it in words.
 *
 * Never throws and never refuses: the caller decides whether a warning stops
 * anything. Nothing here corrects the number either — a check digit says a
 * number is wrong, not which character was misread, and guessing would put a
 * different wrong number on the job.
 */
export function checkContainerNumber(raw: string | null | undefined): ContainerNumberCheck {
  const number = normaliseContainerNumber(String(raw ?? ''));

  if (!number) {
    return { number, wellFormed: false, checkDigitValid: null, problem: 'No container number.' };
  }
  if (!CONTAINER_NUMBER_PATTERN.test(number)) {
    return {
      number, wellFormed: false, checkDigitValid: null,
      problem: 'A container number is four letters then seven digits, like EITU3306045.',
    };
  }

  const expected = containerCheckDigit(number);
  const actual = Number(number[10]);
  if (expected === null || expected === actual) {
    return { number, wellFormed: true, checkDigitValid: true, problem: null };
  }

  return {
    number, wellFormed: true, checkDigitValid: false,
    problem: `${number} does not check out. The last digit should be ${expected}. `
      + 'Read it again from the box or the notice — one letter misread is the usual cause.',
  };
}
