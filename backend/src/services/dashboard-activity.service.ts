import { Types } from "mongoose";
import AttendanceRecordModel from "../models/attendance-record.model";
import PaymentModel from "../models/payment.model";
import { serializeDate, serializeDecimal128 } from "../utils/serialization";

export type DashboardActivityItem =
    | {
          id: string;
          type: "attendance";
          occurredAt: string;
          status: "present" | "absent" | "late" | "excused";
      }
    | {
          id: string;
          type: "payment";
          occurredAt: string;
          amount: string;
          method: "cash" | "bank_transfer" | "card" | "wallet" | "other";
          status: "pending" | "completed" | "failed" | "refunded";
      };

export const getDashboardActivityService = async (
    workspaceId: Types.ObjectId,
    limit: number
): Promise<DashboardActivityItem[]> => {
    const [attendanceRecords, payments] = await Promise.all([
        AttendanceRecordModel.find({ workspaceId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit),
        PaymentModel.find({ workspaceId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit),
    ]);

    return [
        ...attendanceRecords.map((record): DashboardActivityItem => ({
            id: record._id.toString(),
            type: "attendance",
            occurredAt: serializeDate(record.createdAt),
            status: record.status,
        })),
        ...payments.map((payment): DashboardActivityItem => ({
            id: payment._id.toString(),
            type: "payment",
            occurredAt: serializeDate(payment.createdAt),
            amount: serializeDecimal128(payment.amount),
            method: payment.method,
            status: payment.status,
        })),
    ]
        .sort((left, right) =>
            right.occurredAt.localeCompare(left.occurredAt) ||
            right.id.localeCompare(left.id)
        )
        .slice(0, limit);
};
