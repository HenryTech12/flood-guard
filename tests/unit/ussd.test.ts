import { describe, expect, it } from "vitest";
import { runUssd, type UssdContext } from "@/lib/core/ussd";

const zones = [
  {
    id: "gadumo",
    name: "Gadumo / Kpata",
    shortName: "Gadumo/Kpata",
    centroid: [6.756, 7.802] as [number, number],
    landmarks: [
      { id: "kpata-market", name: "Kpata Market", location: [6.76, 7.8] as [number, number] },
      { id: "gadumo-waterside", name: "Gadumo Waterside", location: [6.764, 7.806] as [number, number] },
    ],
  },
  {
    id: "patti",
    name: "Mount Patti",
    shortName: "Mt Patti",
    centroid: [6.72, 7.82] as [number, number],
    landmarks: [{ id: "patti-gate", name: "Mount Patti Gate", location: [6.722, 7.824] as [number, number] }],
  },
];
const shelters = [
  { name: "Far Shelter", location: [6.9, 7.9] as [number, number], capacity: 100, occupancy: 0, phone: "+2348003000009" },
  { name: "Near Full", location: [6.757, 7.803] as [number, number], capacity: 10, occupancy: 10, phone: "+2348003000008" },
  { name: "Near Space", location: [6.75, 7.81] as [number, number], capacity: 50, occupancy: 5, phone: "+2348003000007" },
];
const base: UssdContext = { lang: "en", regionName: "Lokoja", ussdCode: "*384*3566#", shortcode: "3566", resident: null, zones, shelters };
const registered: UssdContext = { ...base, resident: { name: "Test", zoneId: "gadumo", home: [6.758, 7.804] } };

describe("USSD main menu", () => {
  it("shows the menu on empty text", () => {
    const r = runUssd("", base);
    expect(r.response.startsWith("CON")).toBe(true);
    expect(r.response).toContain("1. I need help");
    expect(r.response).toContain("4. Nearest shelter");
  });
  it("uses Pidgin when the resident prefers it", () => {
    expect(runUssd("", { ...base, lang: "pcm" }).response).toContain("I dey safe");
  });
  it("falls back to English for languages awaiting native review", () => {
    expect(runUssd("", { ...base, lang: "ha" }).response).toContain("I need help");
  });
  it("rejects unknown options", () => {
    expect(runUssd("9", base).response.startsWith("END")).toBe(true);
  });
});

describe("USSD help flow", () => {
  it("unregistered: people → vulnerable → type → area → landmark → confirm", () => {
    expect(runUssd("1", base).step).toBe("help:people");
    expect(runUssd("1*4", base).step).toBe("help:vulnerable");
    expect(runUssd("1*4*1", base).step).toBe("help:vulnerable_type");
    expect(runUssd("1*4*1*1", base).step).toBe("help:area");
    expect(runUssd("1*4*1*1*1", base).step).toBe("help:landmark");
    const confirm = runUssd("1*4*1*1*1*1", base);
    expect(confirm.step).toBe("help:confirm");
    expect(confirm.response).toContain("4 people near Kpata Market");
    const done = runUssd("1*4*1*1*1*1*1", base);
    expect(done.response.startsWith("END")).toBe(true);
    expect(done.response).toContain("{ref}");
    expect(done.action).toEqual({ type: "help", peopleCount: 4, vulnerableType: "elderly", location: { kind: "landmark", zoneId: "gadumo", landmarkId: "kpata-market" } });
  });

  it("no vulnerable members skips the type question", () => {
    expect(runUssd("1*2*2", base).step).toBe("help:area");
  });

  it("registered resident can use their home", () => {
    expect(runUssd("1*2*2", registered).step).toBe("help:where");
    const done = runUssd("1*2*2*1*1", registered);
    expect(done.action).toMatchObject({ type: "help", location: { kind: "home" } });
  });

  it("registered resident choosing a landmark skips the area step (uses their zone)", () => {
    expect(runUssd("1*2*2*2", registered).step).toBe("help:landmark");
    expect(runUssd("1*2*2*2*2*1", registered).action).toMatchObject({ location: { kind: "landmark", landmarkId: "gadumo-waterside" } });
  });

  it("'Not sure' landmark falls back to the zone", () => {
    expect(runUssd("1*2*2*2*0", base).step).toBe("help:confirm");
    expect(runUssd("1*2*2*2*0*1", base).action).toMatchObject({ location: { kind: "zone", zoneId: "patti" } });
  });

  it("cancel produces no action", () => {
    const r = runUssd("1*2*2*1*1*2", base);
    expect(r.step).toBe("help:cancelled");
    expect(r.action).toBeUndefined();
  });

  it("invalid people count ends the session", () => {
    expect(runUssd("1*abc", base).step).toBe("help:people:invalid");
    expect(runUssd("1*0", base).step).toBe("help:people:invalid");
  });
});

describe("USSD other options", () => {
  it("safe", () => expect(runUssd("2", base).action).toEqual({ type: "safe" }));

  it("report water with depth", () => {
    expect(runUssd("3", base).step).toBe("report:type");
    expect(runUssd("3*1", base).step).toBe("report:depth");
    expect(runUssd("3*1*2*1*1", base).action).toEqual({ type: "report", reportType: "water_level", depthCm: 50, location: { kind: "landmark", zoneId: "gadumo", landmarkId: "kpata-market" } });
  });

  it("report road blocked has no depth step", () => {
    expect(runUssd("3*2", registered).step).toBe("report:landmark");
  });

  it("nearest shelter with space (skips full ones)", () => {
    const r = runUssd("4", registered);
    expect(r.response).toContain("Near Space");
    expect(r.response.startsWith("END")).toBe(true);
  });

  it("unregistered shelter lookup asks for area", () => {
    expect(runUssd("4", base).step).toBe("shelter:area");
    expect(runUssd("4*1", base).response).toContain("Near Space");
  });

  it("register household end-to-end", () => {
    expect(runUssd("5", base).step).toBe("register:name");
    expect(runUssd("5*Amina", base).step).toBe("register:area");
    expect(runUssd("5*Amina*1*2", base).step).toBe("register:lang");
    expect(runUssd("5*Amina*1*2*2", base).step).toBe("register:vulnerable");
    expect(runUssd("5*Amina*1*2*2*4", base).step).toBe("register:family");
    expect(runUssd("5*Amina*1*2*2*4*08031234567", base).step).toBe("register:consent");
    const done = runUssd("5*Amina*1*2*2*4*08031234567*1", base);
    expect(done.action).toEqual({ type: "register", name: "Amina", zoneId: "gadumo", landmarkId: "gadumo-waterside", lang: "pcm", vulnerableType: "child_under5", familyPhone: "+2348031234567" });
    // The final screen is in the language the resident just chose.
    expect(done.response).toContain("You don register");
  });

  it("register without consent stores nothing", () => {
    expect(runUssd("5*Amina*1*2*2*0*0*2", base).action).toBeUndefined();
  });
});
