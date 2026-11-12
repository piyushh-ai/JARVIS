import { verifyHomeMembership } from "@/services/ai/homeContextService";
import { listRooms } from "@/services/roomService";

export async function listHomeRoomsTool({ homeId, userId } = {}) {
  await verifyHomeMembership({ homeId, userId });
  const rooms = await listRooms({ homeId });

  return {
    rooms: rooms.map((r) => ({
      id: String(r._id),
      name: r.name,
      description: r.description || "",
      floor: r.floor || "",
    })),
  };
}
