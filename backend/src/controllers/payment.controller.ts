import { Request, Response } from "express";
import { toPaymentAllocationDto, toPaymentDto } from "../dtos/payment.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import { InternalServerException } from "../utils/app-error";
import { getPaymentAllocationSummaries } from "../services/financial-summary.service";
import {
    createPaymentAllocationService,
    listPaymentAllocationsService,
} from "../services/payment-allocation.service";
import {
    createPaymentService,
    getPaymentByIdService,
    listPaymentsService,
} from "../services/payment.service";
import {
    CreatePaymentInput,
    CreatePaymentAllocationInput,
    PaymentListQuery,
} from "../validators/payment.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listPaymentsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const workspaceId = getWorkspaceId(req);
        const result = await listPaymentsService(
            workspaceId,
            getValidatedPart<PaymentListQuery>(req, "query")
        );
        const summaries = await getPaymentAllocationSummaries(
            workspaceId,
            result.items
        );

        res.status(200).json({
            message: "Payments retrieved successfully",
            data: {
                items: result.items.map((payment) => {
                    const summary = summaries.get(payment._id.toString());

                    if (!summary) {
                        throw new InternalServerException();
                    }

                    return toPaymentDto(
                        payment,
                        summary.allocatedAmount,
                        summary.unallocatedAmount
                    );
                }),
                pagination: result.pagination,
            },
        });
    }
);

export const createPaymentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const workspaceId = getWorkspaceId(req);
        const payment = await createPaymentService(
            workspaceId,
            getValidatedPart<CreatePaymentInput>(req, "body")
        );
        const summaries = await getPaymentAllocationSummaries(
            workspaceId,
            [payment]
        );
        const summary = summaries.get(payment._id.toString());

        if (!summary) {
            throw new InternalServerException();
        }

        res.status(201).json({
            message: "Payment recorded successfully",
            data: toPaymentDto(
                payment,
                summary.allocatedAmount,
                summary.unallocatedAmount
            ),
        });
    }
);

export const getPaymentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { paymentId } = getValidatedPart<{ paymentId: string }>(
            req,
            "params"
        );
        const workspaceId = getWorkspaceId(req);
        const payment = await getPaymentByIdService(workspaceId, paymentId);
        const summaries = await getPaymentAllocationSummaries(
            workspaceId,
            [payment]
        );
        const summary = summaries.get(payment._id.toString());

        if (!summary) {
            throw new InternalServerException();
        }

        res.status(200).json({
            message: "Payment retrieved successfully",
            data: toPaymentDto(
                payment,
                summary.allocatedAmount,
                summary.unallocatedAmount,
                summary.allocations
            ),
        });
    }
);

export const createPaymentAllocationController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { paymentId } = getValidatedPart<{ paymentId: string }>(
            req,
            "params"
        );
        const allocation = await createPaymentAllocationService(
            getWorkspaceId(req),
            paymentId,
            getValidatedPart<CreatePaymentAllocationInput>(req, "body")
        );

        res.status(201).json({
            message: "Payment allocation created successfully",
            data: toPaymentAllocationDto(allocation),
        });
    }
);

export const listPaymentAllocationsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { paymentId } = getValidatedPart<{ paymentId: string }>(
            req,
            "params"
        );
        const allocations = await listPaymentAllocationsService(
            getWorkspaceId(req),
            paymentId
        );

        res.status(200).json({
            message: "Payment allocations retrieved successfully",
            data: allocations.map(toPaymentAllocationDto),
        });
    }
);
