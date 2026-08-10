import { z } from "zod";

export const DeliveryStatus = z.enum([
  "created", "assigned", "accepted", "en_route_to_pickup",
  "picked_up", "in_transit", "delivered", "failed_attempt",
  "rescheduled", "returned_to_sender", "cancelled",
]);

export type DeliveryStatus = z.infer<typeof DeliveryStatus>;