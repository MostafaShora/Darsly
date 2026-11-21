export interface PaginationMetadata {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}

export const createPaginationMetadata = (
    page: number,
    pageSize: number,
    totalItems: number
): PaginationMetadata => {
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        !Number.isSafeInteger(totalItems) ||
        totalItems < 0
    ) {
        throw new RangeError("Invalid pagination values");
    }

    return {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
    };
};
