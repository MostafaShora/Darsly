import { Types } from "mongoose";
import GuardianModel, { GuardianDocument } from "../models/guardian.model";
import { createPaginationMetadata } from "../utils/pagination";
import {
    CreateGuardianInput,
    GuardianListQuery,
    UpdateGuardianInput,
} from "../validators/guardian.validation";
import { NotFoundException } from "../utils/app-error";

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listGuardiansService = async (
    workspaceId: Types.ObjectId,
    query: GuardianListQuery
) => {
    const search = query.search
        ? new RegExp(escapeRegex(query.search), "i")
        : undefined;
    const filter: {
        workspaceId: Types.ObjectId;
        $or?: Array<
            | { name: RegExp }
            | { phone: RegExp }
            | { alternatePhone: RegExp }
            | { email: RegExp }
        >;
    } = { workspaceId };

    if (search) {
        filter.$or = [
            { name: search },
            { phone: search },
            { alternatePhone: search },
            { email: search },
        ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        GuardianModel.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        GuardianModel.countDocuments(filter),
    ]);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const createGuardianService = async (
    workspaceId: Types.ObjectId,
    input: CreateGuardianInput
) =>
    GuardianModel.create({
        ...input,
        workspaceId,
    });

export const getGuardianByIdService = async (
    workspaceId: Types.ObjectId,
    guardianId: string
) => {
    const guardian = await GuardianModel.findOne({
        _id: guardianId,
        workspaceId,
    });

    if (!guardian) {
        throw new NotFoundException("Guardian not found");
    }

    return guardian;
};

export const updateGuardianService = async (
    workspaceId: Types.ObjectId,
    guardianId: string,
    input: UpdateGuardianInput
) => {
    const guardian = await GuardianModel.findOneAndUpdate(
        {
            _id: guardianId,
            workspaceId,
        },
        { $set: input },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (!guardian) {
        throw new NotFoundException("Guardian not found");
    }

    return guardian;
};
