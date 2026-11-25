import { Router } from "express";
import {
    createPaymentAllocationController,
    createPaymentController,
    getPaymentController,
    listPaymentAllocationsController,
    listPaymentsController,
} from "../controllers/payment.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    createPaymentAllocationSchema,
    createPaymentSchema,
    paymentAllocationParamsSchema,
    paymentListQuerySchema,
    paymentParamsSchema,
} from "../validators/payment.validation";

const paymentRoutes = Router();

paymentRoutes
    .get(
        "/",
        validateRequest({ query: paymentListQuerySchema }),
        listPaymentsController
    )
    .post(
        "/",
        validateRequest({ body: createPaymentSchema }),
        createPaymentController
    )
    .get(
        "/:paymentId/allocations",
        validateRequest({ params: paymentAllocationParamsSchema }),
        listPaymentAllocationsController
    )
    .post(
        "/:paymentId/allocations",
        validateRequest({
            params: paymentAllocationParamsSchema,
            body: createPaymentAllocationSchema,
        }),
        createPaymentAllocationController
    )
    .get(
        "/:paymentId",
        validateRequest({ params: paymentParamsSchema }),
        getPaymentController
    );

export default paymentRoutes;
