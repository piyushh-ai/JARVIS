"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import AICore from "@/components/dashboard/AICore";
import RoomOverview from "@/components/dashboard/RoomOverview";
import RoomManagementSection from "@/features/rooms/RoomManagementSection";
import DeviceManagementSection from "@/features/devices/DeviceManagementSection";
import { useDevices } from "@/hooks/useDevices";
import { useRooms } from "@/hooks/useRooms";
import { prefersReducedMotion } from "@/lib/motion";

export default function Home() {
  const dashboardRef = useRef(null);
  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterType, setFilterType] = useState("");

  // Fetch all devices and rooms once so overview metrics, room counts, and filters share one source of truth
  const {
    devices: allDevices,
    loading: devicesLoading,
    mutating: devicesMutating,
    error: devicesError,
    lastFetchedAt: devicesLastFetchedAt,
    refresh: refreshDevices,
    createDevice,
    updateDevice,
    deleteDevice,
  } = useDevices();

  const {
    rooms,
    loading: roomsLoading,
    mutating: roomsMutating,
    error: roomsError,
    lastFetchedAt: roomsLastFetchedAt,
    refresh: refreshRooms,
    createRoom,
    updateRoom,
    deleteRoom,
  } = useRooms();

  const effectiveFilterRoomId = useMemo(() => {
    if (!filterRoomId || roomsLastFetchedAt === null || roomsError) {
      return filterRoomId;
    }
    return rooms.some((r) => String(r._id) === filterRoomId)
      ? filterRoomId
      : "";
  }, [filterRoomId, rooms, roomsLastFetchedAt, roomsError]);

  const filteredDevices = useMemo(() => {
    return allDevices.filter((device) => {
      if (effectiveFilterRoomId && String(device.roomId) !== effectiveFilterRoomId)
        return false;
      if (filterType && device.type !== filterType) return false;
      return true;
    });
  }, [allDevices, effectiveFilterRoomId, filterType]);

  const dashboardSummary = useMemo(() => {
    const typeCounts = { light: 0, fan: 0, led: 0, other: 0 };
    const connectionCounts = { online: 0, offline: 0, unknown: 0 };
    const reportedCounts = { on: 0, off: 0, unknown: 0 };
    const devicesByRoom = new Map();

    let desiredOnCount = 0;

    for (const device of allDevices) {
      if (device.desiredState === "on") {
        desiredOnCount += 1;
      }

      const typeKey = Object.hasOwn(typeCounts, device.type)
        ? device.type
        : "other";
      typeCounts[typeKey] += 1;

      const connKey = Object.hasOwn(connectionCounts, device.connectionStatus)
        ? device.connectionStatus
        : "unknown";
      connectionCounts[connKey] += 1;

      const repKey = Object.hasOwn(reportedCounts, device.reportedState)
        ? device.reportedState
        : "unknown";
      reportedCounts[repKey] += 1;

      const roomKey = String(device.roomId);
      const list = devicesByRoom.get(roomKey) || [];
      list.push(device);
      devicesByRoom.set(roomKey, list);
    }

    return {
      totalRooms: rooms.length,
      totalDevices: allDevices.length,
      desiredOnCount,
      typeCounts,
      connectionCounts,
      reportedCounts,
      devicesByRoom,
    };
  }, [allDevices, rooms.length]);

  const activeRoomLabel = useMemo(() => {
    if (effectiveFilterRoomId) {
      const selected = rooms.find((r) => String(r._id) === effectiveFilterRoomId);
      return selected?.name || "Filtered Room";
    }
    return "All Rooms";
  }, [effectiveFilterRoomId, rooms]);

  const lastSyncedAt = useMemo(() => {
    if (!devicesLastFetchedAt && !roomsLastFetchedAt) return null;
    return Math.max(devicesLastFetchedAt || 0, roomsLastFetchedAt || 0);
  }, [devicesLastFetchedAt, roomsLastFetchedAt]);

  const overviewError = useMemo(() => {
    if (roomsError && devicesError) {
      return `Rooms: ${roomsError} · Devices: ${devicesError}`;
    }
    return roomsError || devicesError || null;
  }, [roomsError, devicesError]);

  // Coordinated entrance animation for shell landmarks present at mount
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from('[data-gsap="header"]', {
        y: -10,
        opacity: 0,
        duration: 0.35,
        clearProps: "transform,opacity",
      })
        .from(
          '[data-gsap="ai-core"]',
          {
            scale: 0.96,
            opacity: 0,
            duration: 0.45,
            clearProps: "transform,opacity",
          },
          "-=0.18"
        )
        .from(
          '[data-gsap="room-overview"]',
          {
            y: 12,
            opacity: 0,
            duration: 0.38,
            clearProps: "transform,opacity",
          },
          "-=0.22"
        );
    }, dashboardRef);

    return () => ctx.revert();
  }, []);

  const hasSyncError = Boolean(devicesError || roomsError);
  const isSyncing = devicesLoading || roomsLoading;

  const headerStatus = hasSyncError
    ? "error"
    : isSyncing
      ? "syncing"
      : "connected";

  const overviewSyncStatus = hasSyncError
    ? "Error"
    : isSyncing
      ? "Syncing"
      : "DB Synced";

  const handleRefreshAll = useCallback(async () => {
    await Promise.allSettled([refreshRooms(), refreshDevices()]);
  }, [refreshRooms, refreshDevices]);

  const handleDeleteRoom = async (roomId) => {
    const deleted = await deleteRoom(roomId);
    if (filterRoomId === String(roomId)) {
      setFilterRoomId("");
    }
    return deleted;
  };

  return (
    <div
      ref={dashboardRef}
      data-gsap="dashboard-shell"
      className="min-h-dvh flex flex-col bg-hud-grid"
    >
      <Header
        status={headerStatus}
        systemLabel="ROOM OS · LIVE DB"
        onRefresh={handleRefreshAll}
        isRefreshing={isSyncing}
      />

      <main className="hud-container flex-1 py-4 sm:py-6 lg:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-28">
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-6 lg:items-start">
          {/* Left Column: AI Core Hero + Dashboard & Room Overview */}
          <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-5">
            <AICore
              statusLabel={hasSyncError ? "SYNC ERROR" : "SYSTEM STANDBY"}
              totalRooms={dashboardSummary.totalRooms}
              totalDevices={dashboardSummary.totalDevices}
              desiredOnCount={dashboardSummary.desiredOnCount}
              syncNote={
                isSyncing
                  ? "Syncing with MongoDB..."
                  : hasSyncError
                    ? "Backend Connection Error"
                    : "MongoDB Atlas Sync"
              }
            />

            <RoomOverview
              rooms={rooms}
              summary={dashboardSummary}
              selectedRoomId={effectiveFilterRoomId}
              roomLabel={activeRoomLabel}
              syncStatus={overviewSyncStatus}
              loading={isSyncing}
              error={overviewError}
              lastSyncedAt={lastSyncedAt}
              onRefresh={handleRefreshAll}
              onSelectRoom={setFilterRoomId}
              onClearRoomFilter={() => setFilterRoomId("")}
            />
          </div>

          {/* Right Column: Room Management + Device Management */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <RoomManagementSection
              rooms={rooms}
              devices={allDevices}
              devicesByRoom={dashboardSummary.devicesByRoom}
              loading={roomsLoading}
              mutating={roomsMutating}
              error={roomsError}
              selectedRoomId={effectiveFilterRoomId}
              onSelectRoomFilter={setFilterRoomId}
              onRefresh={handleRefreshAll}
              onCreateRoom={createRoom}
              onUpdateRoom={updateRoom}
              onDeleteRoom={handleDeleteRoom}
            />

            <DeviceManagementSection
              devices={filteredDevices}
              rooms={rooms}
              loading={devicesLoading}
              mutating={devicesMutating}
              error={devicesError}
              roomsError={roomsError}
              filterRoomId={effectiveFilterRoomId}
              filterType={filterType}
              onFilterRoomChange={setFilterRoomId}
              onFilterTypeChange={setFilterType}
              onRefresh={handleRefreshAll}
              onCreateDevice={createDevice}
              onUpdateDevice={updateDevice}
              onDeleteDevice={deleteDevice}
            />
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
