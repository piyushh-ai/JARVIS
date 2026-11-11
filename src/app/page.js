"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import AICore from "@/components/dashboard/AICore";
import RoomOverview from "@/components/dashboard/RoomOverview";
import DeviceCard from "@/components/dashboard/DeviceCard";
import { prefersReducedMotion } from "@/lib/motion";

const INITIAL_DEVICES = [
  { id: "main-light", name: "Main Light", iconKey: "light", isOn: true },
  { id: "fan", name: "Fan", iconKey: "fan", isOn: false },
  { id: "led-strip", name: "LED Strip", iconKey: "led", isOn: true },
  { id: "night-light", name: "Night Light", iconKey: "night", isOn: false },
];

export default function Home() {
  const dashboardRef = useRef(null);
  const [devices, setDevices] = useState(INITIAL_DEVICES);

  const activeCount = devices.filter((device) => device.isOn).length;

  // Animation 3: Coordinated staggered dashboard entrance
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
        )
        .from(
          '[data-gsap="device-card"]',
          {
            y: 14,
            opacity: 0,
            duration: 0.36,
            stagger: 0.06,
            clearProps: "transform,opacity",
          },
          "-=0.2"
        );
    }, dashboardRef);

    return () => ctx.revert();
  }, []);

  const handleToggleDevice = (id) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === id ? { ...device, isOn: !device.isOn } : device
      )
    );
  };

  return (
    <div
      ref={dashboardRef}
      data-gsap="dashboard-shell"
      className="min-h-dvh flex flex-col bg-hud-grid"
    >
      <Header isOnline={true} systemLabel="SMART ROOM OS · DEMO" />

      <main className="hud-container flex-1 py-4 sm:py-6 lg:py-8 pb-24 md:pb-28">
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12 lg:gap-6 lg:items-stretch">
          {/* Primary Hero: AI Core */}
          <div className="lg:col-span-5 flex flex-col [&>section]:flex-1">
            <AICore
              statusLabel="SYSTEM STANDBY"
              connectedNodes={devices.length}
              activeNodes={activeCount}
            />
          </div>

          {/* Secondary Panel: Room Overview + Device Controls */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-4 sm:gap-5">
            <RoomOverview
              roomName="Smart Room 01"
              connectedDevices={devices.length}
              activeDevices={activeCount}
              systemStatus="Nominal"
            />

            <section
              aria-labelledby="devices-heading"
              className="space-y-3"
              data-gsap="devices-section"
            >
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="devices-heading"
                  className="font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-foreground"
                >
                  Room Devices
                </h2>
                <span className="text-[11px] text-muted tabular-nums">
                  {activeCount} / {devices.length} ON · Demo State
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-3 sm:gap-4">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    name={device.name}
                    iconKey={device.iconKey}
                    isOn={device.isOn}
                    onToggle={() => handleToggleDevice(device.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
