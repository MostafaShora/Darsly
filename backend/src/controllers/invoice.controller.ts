import { Request, Response } from "express";
import { toInvoiceDto } from "../dtos/invoice.dto";
import { toPaymentAllocationDto } from "../dtos/payment.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import { InternalServerException } from "../utils/app-error";
import {
    getInvoiceAllocationSummaries,
} from "../services/financial-summary.service";
import {
    createInvoiceService,
    getInvoiceByIdService,
    issueInvoiceService,
    listInvoicesService,
    updateInvoiceService,
    voidInvoiceService,
} from "../services/invoice.service";
import { listInvoiceAllocationsService } from "../services/payment-allocation.service";
import {
    CreateInvoiceInput,
    InvoiceListQuery,
    UpdateInvoiceInput,
} from "../validators/invoice.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

const toDto = async (
    workspaceId: ReturnType<typeof getWorkspaceId>,
    invoice: Awaited<ReturnType<typeof getInvoiceByIdService>>
) => {
    const summaries = await getInvoiceAllocationSummaries(
        workspaceId,
        [invoice]
    );
    const summary = summaries.get(invoice._id.toString());

    if (!summary) {
        throw new InternalServerException();
    }

    return toInvoiceDto(invoice, summary.summary);
};

export const listInvoicesController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const workspaceId = getWorkspaceId(req);
        const result = await listInvoicesService(
            workspaceId,
            getValidatedPart<InvoiceListQuery>(req, "query")
        );
        const summaries = await getInvoiceAllocationSummaries(
            workspaceId,
            result.items
        );

        res.status(200).json({
            message: "Invoices retrieved successfully",
            data: {
                items: result.items.map((invoice) => {
                    const summary = summaries.get(invoice._id.toString());

                    if (!summary) {
                        throw new InternalServerException();
                    }

                    return toInvoiceDto(invoice, summary.summary);
                }),
                pagination: result.pagination,
            },
        });
    }
);

export const createInvoiceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const workspaceId = getWorkspaceId(req);
        const invoice = await createInvoiceService(
            workspaceId,
            getValidatedPart<CreateInvoiceInput>(req, "body")
        );

        res.status(201).json({
            message: "Invoice created successfully",
            data: await toDto(workspaceId, invoice),
        });
    }
);

export const getInvoiceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { invoiceId } = getValidatedPart<{ invoiceId: string }>(
            req,
            "params"
        );
        const workspaceId = getWorkspaceId(req);
        const invoice = await getInvoiceByIdService(workspaceId, invoiceId);

        res.status(200).json({
            message: "Invoice retrieved successfully",
            data: await toDto(workspaceId, invoice),
        });
    }
);

export const updateInvoiceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { invoiceId } = getValidatedPart<{ invoiceId: string }>(
            req,
            "params"
        );
        const workspaceId = getWorkspaceId(req);
        const invoice = await updateInvoiceService(
            workspaceId,
            invoiceId,
            getValidatedPart<UpdateInvoiceInput>(req, "body")
        );

        res.status(200).json({
            message: "Invoice updated successfully",
            data: await toDto(workspaceId, invoice),
        });
    }
);

export const issueInvoiceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { invoiceId } = getValidatedPart<{ invoiceId: string }>(
            req,
            "params"
        );
        const workspaceId = getWorkspaceId(req);
        const invoice = await issueInvoiceService(workspaceId, invoiceId);

        res.status(200).json({
            message: "Invoice issued successfully",
            data: await toDto(workspaceId, invoice),
        });
    }
);

export const voidInvoiceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { invoiceId } = getValidatedPart<{ invoiceId: string }>(
            req,
            "params"
        );
        const workspaceId = getWorkspaceId(req);
        const invoice = await voidInvoiceService(workspaceId, invoiceId);

        res.status(200).json({
            message: "Invoice voided successfully",
            data: await toDto(workspaceId, invoice),
        });
    }
);

export const listInvoiceAllocationsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { invoiceId } = getValidatedPart<{ invoiceId: string }>(
            req,
            "params"
        );
        const allocations = await listInvoiceAllocationsService(
            getWorkspaceId(req),
            invoiceId
        );

        res.status(200).json({
            message: "Invoice allocations retrieved successfully",
            data: allocations.map(toPaymentAllocationDto),
        });
    }
);
