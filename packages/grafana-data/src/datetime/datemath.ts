import { TimeZone } from '../types/index';

import { DateTime, dateTime, dateTimeForTimeZone, DurationUnit, isDateTime, ISO_8601 } from './moment_wrapper';

const UNITS: string[] & Array<Extract<DurationUnit, 'y' | 'M' | 'w' | 'd' | 'h' | 'm' | 's' | 'Q'>> = [
  'y',
  'M',
  'w',
  'd',
  'h',
  'm',
  's',
  'Q',
];

const MATH_OP_TYPE_MAP: { [key: string]: number } = {
  '/': 0,
  '+': 1,
  '-': 2,
};
const MAX_DATE_MATH_STRING_LENGTH = 10;
const NOW_STRING = 'now';

/**
 * Determine if a string contains a relative date time.
 * @param text
 */
export function isMathString(text: string | DateTime | Date): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  return text.startsWith(NOW_STRING) || text.includes('||');
}

/**
 * Parses different types input to a moment instance. There is a specific formatting language that can be used
 * if text arg is string. See unit tests for examples.
 * @param text
 * @param roundUp See parseDateMath function.
 * @param timezone Only string 'utc' is acceptable here, for anything else, local timezone is used.
 */
export function parse(
  text?: string | DateTime | Date | null,
  roundUp?: boolean,
  timezone?: TimeZone,
  fiscalYearStartMonth?: number
): DateTime | undefined {
  if (isDateTime(text)) {
    return text;
  }
  if (text instanceof Date) {
    return dateTime(text);
  }
  if (typeof text !== 'string' || text === '') {
    return undefined;
  }

  const [left, right] = text.split('||');

  const getTime = () => {
    return text.startsWith(NOW_STRING) ? dateTimeForTimeZone(timezone) : dateTime(!right ? text : left, ISO_8601);
  };

  const getMathString = () => {
    return text.startsWith(NOW_STRING) ? text.substring(NOW_STRING.length) : right ?? '';
  };

  const time = getTime();
  const mathString = getMathString();
  if (mathString === '') {
    return time;
  }

  return parseDateMath(mathString, time, roundUp, fiscalYearStartMonth);
}

/**
 * Checks if text is a valid date which in this context means that it is either a Moment instance or it can be parsed
 * by parse function. See parse function to see what is considered acceptable.
 * @param text
 */
export function isValid(text: string | DateTime): boolean {
  const date = parse(text);
  return typeof date === 'undefined' ? false : date.isValid();
}

/**
 * Verify if input param is a valid number
 * @param input
 */

export const isNumber = (input: string | number) => {
  return /^-?\d+\.?\d*$/.test(String(input));
};

/**
 * Parses math part of the time string and shifts supplied time according to that math. See unit tests for examples.
 * @param mathString
 * @param time
 * @param roundUp If true it will round the time to endOf time unit, otherwise to startOf time unit.
 */
// TODO: Had to revert Andrejs `time: moment.Moment` to `time: any`
export function parseDateMath(
  mathString: string,
  time: any,
  roundUp?: boolean,
  fiscalYearStartMonth = 0
): DateTime | undefined {
  const strippedMathString = mathString.replace(/\s/g, '');
  const dateTime = time;
  let i = 0;
  const len = strippedMathString.length;

  const nextChar = () => {
    return strippedMathString.charAt(i++);
  };

  while (i < len) {
    const getNum = () => {
      if (!isNumber(strippedMathString.charAt(i))) {
        return 1;
      }
      if (strippedMathString.length === 2) {
        return parseInt(strippedMathString.charAt(i), 10);
      }

      const numFrom = i;
      while (!isNumber(nextChar())) {
        if (i > MAX_DATE_MATH_STRING_LENGTH) {
          return undefined;
        }
      }

      return parseInt(strippedMathString.substring(numFrom, i), 10);
    };

    const type = MATH_OP_TYPE_MAP[nextChar()];
    const num = getNum();
    const char = nextChar();
    const isFiscal = char === 'f';
    const unit = isFiscal ? nextChar() : char;

    if (
      typeof type === 'undefined' ||
      // rounding is only allowed on whole, single, units (eg M or 1M, not 0.5M or 2M)
      (type === 0 && num !== 1) ||
      !UNITS.includes(unit)
    ) {
      return undefined;
    }

    switch (type) {
      case 0: {
        if (isFiscal) {
          roundToFiscal(fiscalYearStartMonth, dateTime, unit, roundUp);
          break;
        }
        if (roundUp) {
          dateTime.endOf(unit);
          break;
        }
        dateTime.startOf(unit);
        break;
      }
      case 1:
        dateTime.add(num, unit);
        break;
      case 2:
        dateTime.subtract(num, unit);
        break;
      default:
    }
  }
  return dateTime;
}

export function roundToFiscal(fyStartMonth: number, dateTime: any, unit: string, roundUp: boolean | undefined) {
  switch (unit) {
    case 'y':
      if (roundUp) {
        roundToFiscal(fyStartMonth, dateTime, unit, false).add(11, 'M').endOf('M');
      } else {
        dateTime.subtract((dateTime.month() - fyStartMonth + 12) % 12, 'M').startOf('M');
      }
      return dateTime;
    case 'Q':
      if (roundUp) {
        roundToFiscal(fyStartMonth, dateTime, unit, false).add(2, 'M').endOf('M');
      } else {
        dateTime.subtract((dateTime.month() - fyStartMonth + 3) % 3, 'M').startOf('M');
      }
      return dateTime;
    default:
      return undefined;
  }
}
