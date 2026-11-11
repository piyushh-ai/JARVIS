"use client";

import {
  createRoom as createRoomApi,
  deleteRoom as deleteRoomApi,
  getRoomById,
  getRooms,
  updateRoom as updateRoomApi,
} from "@/services/roomApi";
import { useCollectionResource } from "@/hooks/useCollectionResource";

const ROOM_RESOURCE_API = {
  list: getRooms,
  getById: getRoomById,
  create: createRoomApi,
  update: updateRoomApi,
  remove: deleteRoomApi,
};

/**
 * Reusable hook for fetching and mutating smart rooms via /api/rooms.
 */
export function useRooms({ ownerId, autoFetch = true } = {}) {
  const {
    items,
    loading,
    mutating,
    error,
    mutationError,
    lastFetchedAt,
    refresh,
    fetchItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
  } = useCollectionResource({
    api: ROOM_RESOURCE_API,
    filters: { ownerId },
    autoFetch,
  });

  return {
    rooms: items,
    loading,
    mutating,
    error,
    mutationError,
    lastFetchedAt,
    refresh,
    fetchRooms: fetchItems,
    getRoom: getItem,
    createRoom: createItem,
    updateRoom: updateItem,
    deleteRoom: deleteItem,
  };
}

export default useRooms;
