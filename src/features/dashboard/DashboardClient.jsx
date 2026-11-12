"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { Shield } from "lucide-react";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import AICore from "@/components/dashboard/AICore";
import RoomOverview from "@/components/dashboard/RoomOverview";
import SmartScenesSection from "@/features/scenes/SmartScenesSection";
import RoomManagementSection from "@/features/rooms/RoomManagementSection";
import DeviceManagementSection from "@/features/devices/DeviceManagementSection";
import ControllerManagementSection from "@/features/controllers/ControllerManagementSection";
import { useAuth } from "@/hooks/useAuth";
import { useControllers } from "@/hooks/useControllers";
import { useDevices } from "@/hooks/useDevices";
import { useRooms } from "@/hooks/useRooms";
import { prefersReducedMotion } from "@/lib/motion";

export default function DashboardClient({ initialAuth }) {
  const router = useRouter();
  const dashboardRef = useRef(null);
  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterType, setFilterType] = useState("");

  const {
    user,
    homes,
    currentHome,
    mutating: authMutating,
    switchHome,
    createHome,
    logout,
  } = useAuth({ initialAuth });

  const activeHomeId = currentHome?._id || "";

  const {
    devices: allDevices,
    loading: devicesLoading,
    mutating: devicesMutating,
    error: devicesError,
    lastFetchedAt: devicesLastFetchedAt,
    syncStateByDevice,
    refresh: refreshDevices,
    createDevice,
    updateDevice,
    toggleDevice,
    applySceneOutcome,
    deleteDevice,
  } = useDevices({
    homeId: activeHomeId,
    autoFetch: Boolean(activeHomeId),
  });

  const {
    controllers,
    loading: controllersLoading,
    mutating: controllersMutating,
    error: controllersError,
    refresh: refreshControllers,
    provisionController,
    rotateController,
    revokeController,
  } = useControllers({
    homeId: activeHomeId,
    autoFetch: Boolean(activeHomeId),
  });

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
  } = useRooms({
    homeId: activeHomeId,
    autoFetch: Boolean(activeHomeId),
  });

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
      if (effectiveFilterRoomId && String(device.roomId) !== effectiveFilterRoomId) {
        return false;
      }
      if (filterType && device.type !== filterType) {
        return false;
      }
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

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

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

  const hasSyncError = Boolean(devicesError || roomsError || controllersError);
  const isSyncing = devicesLoading || roomsLoading || controllersLoading;

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
    await Promise.allSettled([
      refreshRooms(),
      refreshDevices(),
      refreshControllers(),
    ]);
  }, [refreshRooms, refreshDevices, refreshControllers]);

  const handleSwitchHome = useCallback(
    async (homeId) => {
      await switchHome(homeId);
      setFilterRoomId("");
      setFilterType("");
    },
    [switchHome]
  );

  const handleCreateHome = useCallback(
    async (name) => {
      await createHome(name);
      setFilterRoomId("");
      setFilterType("");
    },
    [createHome]
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [logout, router]);

  const handleCreateRoom = useCallback(
    async (payload) => {
      return createRoom({
        ...payload,
        ...(activeHomeId ? { homeId: activeHomeId } : {}),
      });
    },
    [createRoom, activeHomeId]
  );

  const handleCreateDevice = useCallback(
    async (payload) => {
      return createDevice({
        ...payload,
        ...(activeHomeId ? { homeId: activeHomeId } : {}),
      });
    },
    [createDevice, activeHomeId]
  );

  const handleToggleDevice = useCallback(
    async (deviceId, payload) => {
      return toggleDevice(deviceId, {
        ...payload,
        ...(activeHomeId ? { homeId: activeHomeId } : {}),
      });
    },
    [toggleDevice, activeHomeId]
  );

  const handleRevokeController = useCallback(
    async (controllerId) => {
      const res = await revokeController(controllerId);
      await refreshDevices().catch(() => {});
      return res;
    },
    [revokeController, refreshDevices]
  );

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
        user={user}
        homes={homes}
        currentHome={currentHome}
        onSwitchHome={handleSwitchHome}
        onCreateHome={handleCreateHome}
        onLogout={handleLogout}
        authMutating={authMutating}
        onRefresh={handleRefreshAll}
        isRefreshing={isSyncing}
      />

      <main className="hud-container flex-1 py-4 sm:py-6 lg:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-28">
        {currentHome?.role === "member" && (
          <div
            role="status"
            className="mb-4 flex items-center gap-2.5 rounded-2xl hud-surface border-cyan-primary/25 px-4 py-2.5 text-xs text-muted"
          >
            <Shield className="h-4 w-4 shrink-0 text-cyan-primary" aria-hidden="true" />
            <span>
              Viewing <strong className="text-foreground">{currentHome.name}</strong> with{" "}
              <strong className="text-cyan-primary">Member</strong> access: device power toggles are enabled; structural edits require Owner or Admin permission.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-6 lg:items-start">
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

            <SmartScenesSection
              key={activeHomeId}
              homeId={activeHomeId}
              devices={allDevices}
              onSceneComplete={applySceneOutcome}
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
              onCreateRoom={handleCreateRoom}
              onUpdateRoom={updateRoom}
              onDeleteRoom={handleDeleteRoom}
            />

            <DeviceManagementSection
              devices={filteredDevices}
              allDevices={allDevices}
              rooms={rooms}
              controllers={controllers}
              syncStateByDevice={syncStateByDevice}
              loading={devicesLoading}
              mutating={devicesMutating}
              error={devicesError}
              roomsError={roomsError}
              filterRoomId={effectiveFilterRoomId}
              filterType={filterType}
              onFilterRoomChange={setFilterRoomId}
              onFilterTypeChange={setFilterType}
              onRefresh={handleRefreshAll}
              onCreateDevice={handleCreateDevice}
              onUpdateDevice={updateDevice}
              onToggleDevice={handleToggleDevice}
              onDeleteDevice={deleteDevice}
            />

            <ControllerManagementSection
              key={activeHomeId}
              controllers={controllers}
              devices={allDevices}
              loading={controllersLoading}
              mutating={controllersMutating}
              error={controllersError}
              canManage={
                currentHome?.role === "owner" || currentHome?.role === "admin"
              }
              onRefresh={handleRefreshAll}
              onProvision={provisionController}
              onRotate={rotateController}
              onRevoke={handleRevokeController}
            />
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

