import { Router } from "express";
import {
    createInvoiceController,
    getInvoiceController,
    issueInvoiceController,
    listInvoiceAllocationsController,
    listInvoicesController,
    updateInvoiceController,
    voidInvoiceController,
} from "../controllers/invoice.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    createInvoiceSchema,
    invoiceActionBodySchema,
    invoiceAllocationParamsSchema,
    invoiceListQuerySchema,
    invoiceParamsSchema,
    updateInvoiceSchema,
} from "../validators/invoice.validation";

const invoiceRoutes = Router();

invoiceRoutes
    .get(
        "/",
        validateRequest({ query: invoiceListQuerySchema }),
        listInvoicesController
    )
    .post(
        "/",
        validateRequest({ body: createInvoiceSchema }),
        createInvoiceController
    )
    .get(
        "/:invoiceId/allocations",
        validateRequest({ params: invoiceAllocationParamsSchema }),
        listInvoiceAllocationsController
    )
    .post(
        "/:invoiceId/issue",
        validateRequest({
            params: invoiceParamsSchema,
            body: invoiceActionBodySchema,
        }),
        issueInvoiceController
    )
    .post(
        "/:invoiceId/void",
        validateRequest({
            params: invoiceParamsSchema,
            body: invoiceActionBodySchema,
        }),
        voidInvoiceController
    )
    .get(
        "/:invoiceId",
        validateRequest({ params: invoiceParamsSchema }),
        getInvoiceController
    )
    .patch(
        "/:invoiceId",
        validateRequest({
            params: invoiceParamsSchema,
            body: updateInvoiceSchema,
        }),
        updateInvoiceController
    );

export default invoiceRoutes;
