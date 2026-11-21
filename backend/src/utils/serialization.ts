import { Types } from "mongoose";

export const serializeDate = (value: Date): string => {
    if (Number.isNaN(value.getTime())) {
        throw new TypeError("Cannot serialize an invalid date");
    }

    return value.toISOString();
};

export const serializeDecimal128 = (value: Types.Decimal128): string =>
    value.toString();
