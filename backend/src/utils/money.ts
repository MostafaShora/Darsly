interface DecimalParts {
    coefficient: bigint;
    scale: number;
}

const DECIMAL128_MAX_SIGNIFICANT_DIGITS = 34;
const MONTH_DAY_LCM = 377_580n;

const decimalParts = (value: string): DecimalParts => {
    const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(
        value.trim()
    );

    if (!match) {
        throw new TypeError("Invalid decimal value");
    }

    const sign = match[1] === "-" ? -1n : 1n;
    const fraction = match[3] ?? "";
    const exponent = Number(match[4] ?? "0");

    if (!Number.isSafeInteger(exponent)) {
        throw new RangeError("Decimal exponent is out of range");
    }

    let coefficient = BigInt(`${match[2]}${fraction}`) * sign;
    let scale = fraction.length - exponent;

    if (scale < 0) {
        coefficient *= 10n ** BigInt(-scale);
        scale = 0;
    }

    while (scale > 0 && coefficient % 10n === 0n) {
        coefficient /= 10n;
        scale -= 1;
    }

    return { coefficient, scale };
};

const decimalString = ({ coefficient, scale }: DecimalParts): string => {
    if (coefficient === 0n) {
        return "0";
    }

    const negative = coefficient < 0n;
    const digits = (negative ? -coefficient : coefficient)
        .toString()
        .padStart(scale + 1, "0");
    const integer =
        scale === 0 ? digits : digits.slice(0, digits.length - scale);
    const fraction = scale === 0 ? "" : digits.slice(digits.length - scale);

    return `${negative ? "-" : ""}${integer}${
        fraction ? `.${fraction}` : ""
    }`;
};

const alignDecimals = (
    left: DecimalParts,
    right: DecimalParts
): [bigint, bigint, number] => {
    const scale = Math.max(left.scale, right.scale);

    return [
        left.coefficient * 10n ** BigInt(scale - left.scale),
        right.coefficient * 10n ** BigInt(scale - right.scale),
        scale,
    ];
};

const significantDigits = (value: string): number => {
    const digits = value.replace(/^[+-]/, "").replace(".", "");
    return digits.replace(/^0+/, "").length || 1;
};

const validateDecimal128 = (value: string): string => {
    const normalized = decimalString(decimalParts(value));

    if (
        normalized.length > 128 ||
        significantDigits(normalized) > DECIMAL128_MAX_SIGNIFICANT_DIGITS
    ) {
        throw new RangeError("Decimal value exceeds Decimal128 precision");
    }

    return normalized;
};

export const compareDecimalStrings = (
    left: string,
    right: string
): number => {
    const [leftValue, rightValue] = alignDecimals(
        decimalParts(left),
        decimalParts(right)
    );

    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
};

export const addDecimalStrings = (left: string, right: string): string => {
    const [leftValue, rightValue, scale] = alignDecimals(
        decimalParts(left),
        decimalParts(right)
    );

    return decimalString({
        coefficient: leftValue + rightValue,
        scale,
    });
};

export const subtractDecimalStrings = (
    left: string,
    right: string
): string => {
    const [leftValue, rightValue, scale] = alignDecimals(
        decimalParts(left),
        decimalParts(right)
    );

    return decimalString({
        coefficient: leftValue - rightValue,
        scale,
    });
};

export const sumDecimalStrings = (values: string[]): string =>
    values.reduce(addDecimalStrings, "0");

export const toDecimal128String = (value: string): string =>
    validateDecimal128(value);

const daysInMonth = (year: number, month: number): number => {
    if (month === 2) {
        const leapYear =
            year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        return leapYear ? 29 : 28;
    }

    return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const parseCalendarDate = (value: string): [number, number, number] => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        throw new TypeError("Date must use YYYY-MM-DD");
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth(year, month)
    ) {
        throw new TypeError("Invalid calendar date");
    }

    return [year, month, day];
};

const centsToDecimal = (cents: bigint): string => {
    const whole = cents / 100n;
    const fraction = (cents % 100n).toString().padStart(2, "0");
    const value = `${whole}.${fraction}`;
    validateDecimal128(value);
    return value;
};

export const calculateProratedInvoiceAmount = (
    monthlyFee: string,
    periodStart: string,
    periodEnd: string
): string => {
    const fee = decimalParts(monthlyFee);

    if (fee.coefficient <= 0n) {
        throw new RangeError("Monthly fee must be greater than zero");
    }

    const [startYear, startMonth, startDay] =
        parseCalendarDate(periodStart);
    const [endYear, endMonth, endDay] = parseCalendarDate(periodEnd);

    if (periodEnd < periodStart) {
        throw new RangeError("periodEnd must not precede periodStart");
    }

    const startMonthIndex = startYear * 12 + startMonth - 1;
    const endMonthIndex = endYear * 12 + endMonth - 1;
    let coverageUnits: bigint;

    if (startMonthIndex === endMonthIndex) {
        const coveredDays = endDay - startDay + 1;
        coverageUnits =
            BigInt(coveredDays) *
            (MONTH_DAY_LCM / BigInt(daysInMonth(startYear, startMonth)));
    } else {
        const firstMonthDays = daysInMonth(startYear, startMonth);
        const middleMonths = endMonthIndex - startMonthIndex - 1;

        coverageUnits =
            BigInt(firstMonthDays - startDay + 1) *
                (MONTH_DAY_LCM / BigInt(firstMonthDays)) +
            BigInt(middleMonths) * MONTH_DAY_LCM +
            BigInt(endDay) *
                (MONTH_DAY_LCM / BigInt(daysInMonth(endYear, endMonth)));
    }

    const denominator =
        10n ** BigInt(fee.scale) * MONTH_DAY_LCM;
    const numerator = fee.coefficient * coverageUnits * 100n;
    let cents = numerator / denominator;

    if ((numerator % denominator) * 2n >= denominator) {
        cents += 1n;
    }

    return centsToDecimal(cents);
};
